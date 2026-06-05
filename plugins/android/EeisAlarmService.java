package com.eeis.prayertimes;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

/**
 * EeisAlarmService — Foreground Service that plays prayer alarm audio.
 *
 * AUDIO: MediaPlayer with AudioAttributes.USAGE_ALARM
 *   → Bypasses Do Not Disturb on all Android versions
 *   → Plays on alarm audio stream (separate from media/notification streams)
 *   → Works on Samsung One UI 7 / Android 16 with screen locked
 *
 * NOTIFICATION: MediaStyle with 5 actions
 *   Compact (always visible): [⏹ Stop]  [⏸/▶ Pause/Resume]  [🧭 Qibla]
 *   Expanded (swipe down):    above + [🗓 Calendar]  [♥ Donate]
 *
 * LOCK SCREEN: fullScreenIntent → EeisAlarmActivity (setShowWhenLocked = true)
 *
 * v18: per-prayer boolean effect flags (splash, flash, vibrate, quotes) replace global alarmMode string.
 */
public class EeisAlarmService extends Service {

    // ─── Channel ──────────────────────────────────────────────────────────────
    public static final String CHANNEL_ID = "eeis-prayer-alarm";
    public static final int    NOTIF_ID   = 9001;

    // ─── Intent actions ───────────────────────────────────────────────────────
    public static final String ACTION_DISMISS = "com.eeis.prayertimes.DISMISS_ALARM";
    public static final String ACTION_PAUSE   = "com.eeis.prayertimes.PAUSE_ALARM";
    public static final String ACTION_RESUME  = "com.eeis.prayertimes.RESUME_ALARM";

    // ─── Intent extras (must match EeisAlarmModule) ───────────────────────────
    public static final String EXTRA_SOUND            = "sound";
    public static final String EXTRA_PRAYER_NAME      = "prayerName";
    public static final String EXTRA_BODY             = "body";
    public static final String EXTRA_LOOP             = "loop";
    public static final String EXTRA_ALARM_ID         = "alarmId";
    public static final String EXTRA_SPLASH           = "splash";     // v18
    public static final String EXTRA_FLASH            = "flash";      // v18
    public static final String EXTRA_VIBRATE          = "vibrate";    // v18
    public static final String EXTRA_QUOTES           = "quotes";     // v18
    public static final String EXTRA_QUOTE_TEXT       = "quoteText";  // v18
    public static final String EXTRA_QUOTE_REF        = "quoteRef";   // v18
    public static final String EXTRA_CUSTOM_SOUND_URI = "customSoundUri";
    public static final String EXTRA_BEGINS_TIME      = "beginsTime";  // v24
    public static final String EXTRA_JAMAAT_TIME      = "jamaatTime";  // v24
    public static final String EXTRA_USE_JAMAAT       = "useJamaat";   // v24

    // ─── State (static so EeisAlarmModule can read/write) ────────────────────
    public static volatile boolean sIsPlaying = false;
    public static volatile boolean sIsPaused  = false;
    public static volatile String  sPrayerName = "";

    // ─── Private fields ───────────────────────────────────────────────────────
    private MediaPlayer         mediaPlayer;
    private MediaSessionCompat  mediaSession;
    private String              currentPrayerName = "";
    private String              currentBody       = "";
    private String              currentAlarmId    = "";
    private boolean             loopEnabled       = false;

    // Current effect flags — stored for notification rebuild on pause/resume
    private boolean currentSplash     = false;
    private boolean currentHasAudio   = false;  // true if a sound will actually play
    private boolean currentFlash      = false;
    private boolean currentVibrate    = false;
    private boolean currentQuotes     = false;
    private String  currentQuoteText      = "";
    private String  currentQuoteRef       = "";
    private String  currentCustomSoundUri = "";
    private String  currentBeginsTime     = "";  // v24
    private String  currentJamaatTime     = "";  // v24
    private boolean currentUseJamaat      = false; // v24

    // ─── Torch flash ──────────────────────────────────────────────────────────
    private Handler  torchHandler;
    private boolean  torchOn       = false;
    private String   torchCameraId = null;
    private static final int TORCH_ON_MS   = 500;
    private static final int TORCH_OFF_MS  = 400;
    // SAFETY: cap the number of flash pulses so the LED can never strobe
    // indefinitely (perpetual strobing can overheat / damage the flash module).
    // Loop affects ONLY the sound (mediaPlayer.setLooping) - never the flash.
    private static final int MAX_FLASH_PULSES = 3;
    private int      flashesDone   = 0;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        setupMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        final String action = intent.getAction();

        if (ACTION_DISMISS.equals(action)) {
            stopAlarm();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            pausePlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            resumePlayback();
            return START_NOT_STICKY;
        }

        // ── New alarm ─────────────────────────────────────────────────────────
        String soundName      = intent.getStringExtra(EXTRA_SOUND);
        String customSoundUri = nvl(intent.getStringExtra(EXTRA_CUSTOM_SOUND_URI), "");
        currentPrayerName     = nvl(intent.getStringExtra(EXTRA_PRAYER_NAME), "Prayer");
        currentBody           = nvl(intent.getStringExtra(EXTRA_BODY), "");
        currentAlarmId        = nvl(intent.getStringExtra(EXTRA_ALARM_ID), "alarm");
        loopEnabled           = intent.getBooleanExtra(EXTRA_LOOP, false);
        currentSplash         = intent.getBooleanExtra(EXTRA_SPLASH,  false);
        currentFlash          = intent.getBooleanExtra(EXTRA_FLASH,   false);
        currentVibrate        = intent.getBooleanExtra(EXTRA_VIBRATE, false);
        currentQuotes         = intent.getBooleanExtra(EXTRA_QUOTES,  false);
        currentQuoteText      = nvl(intent.getStringExtra(EXTRA_QUOTE_TEXT), "");
        currentQuoteRef       = nvl(intent.getStringExtra(EXTRA_QUOTE_REF),  "");
        currentCustomSoundUri = customSoundUri;
        currentBeginsTime     = nvl(intent.getStringExtra(EXTRA_BEGINS_TIME), "");
        currentJamaatTime     = nvl(intent.getStringExtra(EXTRA_JAMAAT_TIME), "");
        currentUseJamaat      = intent.getBooleanExtra(EXTRA_USE_JAMAAT, false);
        // hasAudio: a real sound will play (not silent). Used to hide the Pause button
        // on the alarm screen when there's nothing to pause.
        boolean hasNamedSound = soundName != null && !soundName.isEmpty() && !"none".equals(soundName);
        currentHasAudio = ("custom".equals(soundName) && !customSoundUri.isEmpty())
                || (!"custom".equals(soundName) && hasNamedSound);

        sIsPaused   = false;
        sIsPlaying  = false;
        sPrayerName = currentPrayerName;

        // Post foreground notification immediately (required on API 26+ within 5 s)
        createNotificationChannel();
        startForegroundWithType(buildNotification(false));

        // Force the full-screen flash Activity to launch even when the app is in the
        // FOREGROUND. Android suppresses fullScreenIntent while the app is open, so on its
        // own the flash screen would never appear for a user looking at the app. Starting
        // the Activity directly covers locked, backgrounded AND foreground. The intent uses
        // SINGLE_TOP|CLEAR_TOP so a redundant launch is coalesced via onNewIntent (no dupes).
        // The Activity's Stop→dismiss() then fires the eeis://billboard deep link as usual.
        if (currentSplash) {
            try { startActivity(buildAlarmActivityIntent()); } catch (Exception ignored) {}
        }

        if (currentVibrate) vibrateOnAlarm();
        if (currentFlash)   startTorchFlash();

        if ("custom".equals(soundName) && !customSoundUri.isEmpty()) {
            playAlarmSoundFromUri(customSoundUri, loopEnabled);
        } else {
            playAlarmSound(soundName, loopEnabled);
        }

        EeisAlarmModule.emitState("playing", currentPrayerName);

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        releaseMediaSession();
        sIsPlaying  = false;
        sIsPaused   = false;
        sPrayerName = "";
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ─── Audio ────────────────────────────────────────────────────────────────

    private void playAlarmSound(String soundName, boolean loop) {
        releasePlayer();
        if (soundName == null || soundName.isEmpty() || "none".equals(soundName)) {
            sIsPlaying = false;
            updatePlaybackState(PlaybackStateCompat.STATE_NONE);
            return;
        }

        int resId = getResources().getIdentifier(soundName, "raw", getPackageName());
        if (resId == 0) {
            sIsPlaying = false;
            return;
        }

        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();

        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(attrs);
            mediaPlayer.setDataSource(this,
                    Uri.parse("android.resource://" + getPackageName() + "/" + resId));
            mediaPlayer.setLooping(loop);
            mediaPlayer.prepare();

            if (!loop) {
                mediaPlayer.setOnCompletionListener(mp -> stopAlarm());
            }

            mediaPlayer.start();
            sIsPlaying = true;
            sIsPaused  = false;
            updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
            updateNotification();

        } catch (Exception e) {
            e.printStackTrace();
            releasePlayer();
        }
    }

    private void playAlarmSoundFromUri(String uri, boolean loop) {
        releasePlayer();
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(attrs);
            mediaPlayer.setDataSource(this, Uri.parse(uri));
            mediaPlayer.setLooping(loop);
            mediaPlayer.prepare();
            if (!loop) {
                mediaPlayer.setOnCompletionListener(mp -> stopAlarm());
            }
            mediaPlayer.start();
            sIsPlaying = true;
            sIsPaused  = false;
            updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
            updateNotification();
        } catch (Exception e) {
            e.printStackTrace();
            releasePlayer();
        }
    }

    private void pausePlayback() {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            sIsPaused  = true;
            sIsPlaying = false;
            updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
            updateNotification();
            EeisAlarmModule.emitState("paused", currentPrayerName);
        }
    }

    private void resumePlayback() {
        if (mediaPlayer != null && sIsPaused) {
            mediaPlayer.start();
            sIsPaused  = false;
            sIsPlaying = true;
            updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
            updateNotification();
            EeisAlarmModule.emitState("playing", currentPrayerName);
        }
    }

    private void stopAlarm() {
        stopTorchFlash();
        releasePlayer();
        releaseMediaSession();
        stopForeground(true);
        sIsPlaying  = false;
        sIsPaused   = false;
        sPrayerName = "";
        EeisAlarmModule.emitState("stopped", "");
        stopSelf();
    }

    private void releasePlayer() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }

    // ─── Torch flash ──────────────────────────────────────────────────────────

    private void startTorchFlash() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            if (cm == null) return;
            for (String id : cm.getCameraIdList()) {
                android.hardware.camera2.CameraCharacteristics chars =
                    cm.getCameraCharacteristics(id);
                Boolean hasFlash = chars.get(
                    android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(hasFlash)) {
                    torchCameraId = id;
                    break;
                }
            }
            if (torchCameraId == null) return;
            torchHandler = new Handler(Looper.getMainLooper());
            torchOn = false;
            flashesDone = 0;
            torchHandler.post(torchRunnable);
        } catch (Exception e) {
            // Non-fatal
        }
    }

    private final Runnable torchRunnable = new Runnable() {
        @Override public void run() {
            if (torchHandler == null || torchCameraId == null) return;
            torchOn = !torchOn;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                    if (cm != null) cm.setTorchMode(torchCameraId, torchOn);
                }
            } catch (Exception ignored) {}
            if (torchOn) {
                // Just turned ON - count this pulse
                flashesDone++;
                torchHandler.postDelayed(this, TORCH_ON_MS);
            } else {
                // Just turned OFF - stop once we've completed the capped number of pulses
                if (flashesDone >= MAX_FLASH_PULSES) {
                    stopTorchFlash();
                    return;
                }
                torchHandler.postDelayed(this, TORCH_OFF_MS);
            }
        }
    };

    private void stopTorchFlash() {
        if (torchHandler != null) {
            torchHandler.removeCallbacksAndMessages(null);
            torchHandler = null;
        }
        if (torchCameraId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (cm != null) cm.setTorchMode(torchCameraId, false);
            } catch (Exception ignored) {}
        }
        torchCameraId = null;
        torchOn = false;
    }

    @SuppressWarnings("deprecation")
    private void vibrateOnAlarm() {
        try {
            long[] pattern = {0, 700, 300, 700, 300, 700, 300, 700};

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator v = vm.getDefaultVibrator();
                    VibrationEffect effect = VibrationEffect.createWaveform(pattern, -1);
                    v.vibrate(effect);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    VibrationEffect effect = VibrationEffect.createWaveform(pattern, -1);
                    v.vibrate(effect);
                }
            } else {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    v.vibrate(pattern, -1);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // ─── MediaSession ─────────────────────────────────────────────────────────

    private void setupMediaSession() {
        mediaSession = new MediaSessionCompat(this, "EeisAlarm");
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPause()  { pausePlayback();  }
            @Override public void onPlay()   { resumePlayback(); }
            @Override public void onStop()   { stopAlarm();      }
        });

        mediaSession.setActive(true);
        updatePlaybackState(PlaybackStateCompat.STATE_NONE);
    }

    private void updatePlaybackState(int state) {
        if (mediaSession == null) return;

        long actions = PlaybackStateCompat.ACTION_STOP;
        if (state == PlaybackStateCompat.STATE_PLAYING) {
            actions |= PlaybackStateCompat.ACTION_PAUSE;
        } else if (state == PlaybackStateCompat.STATE_PAUSED) {
            actions |= PlaybackStateCompat.ACTION_PLAY;
        }

        PlaybackStateCompat pbState = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build();
        mediaSession.setPlaybackState(pbState);

        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,
                        currentPrayerName + " Prayer Time")
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST,
                        "EEIS · Epsom & Ewell Islamic Society")
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentBody)
                .build();
        mediaSession.setMetadata(metadata);
    }

    private void releaseMediaSession() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Prayer Alarms", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(null, null);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 500, 250, 500});
        ch.setShowBadge(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.notify(NOTIF_ID, buildNotification(sIsPaused));
    }

    // Builds the intent that opens the full-screen alarm/flash Activity, with all extras.
    // Shared by the notification's fullScreenIntent and the direct foreground launch.
    private Intent buildAlarmActivityIntent() {
        Intent activityIntent = new Intent(this, EeisAlarmActivity.class);
        activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_PRAYER_NAME, currentPrayerName);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_BODY,        currentBody);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_ALARM_ID,    currentAlarmId);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_SPLASH,       currentSplash);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_QUOTE_TEXT,   currentQuoteText);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_QUOTE_REF,    currentQuoteRef);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_BEGINS_TIME,  currentBeginsTime);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_JAMAAT_TIME,  currentJamaatTime);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_USE_JAMAAT,   currentUseJamaat);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_HAS_AUDIO,    currentHasAudio);
        return activityIntent;
    }

    private Notification buildNotification(boolean isPaused) {
        // ── fullScreenIntent → EeisAlarmActivity ──────────────────────────────
        Intent activityIntent = buildAlarmActivityIntent();
        PendingIntent fullScreenPI = PendingIntent.getActivity(this,
                currentAlarmId.hashCode(), activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent stopPI = servicePI(ACTION_DISMISS, 10);
        PendingIntent pauseResumePI = servicePI(
                isPaused ? ACTION_RESUME : ACTION_PAUSE, 11);
        String pauseResumeLabel = isPaused ? "Resume" : "Pause";
        int pauseResumeIcon = isPaused
                ? android.R.drawable.ic_media_play
                : android.R.drawable.ic_media_pause;

        PendingIntent qiblaPI    = deepLinkPI("eeis://qibla",    20);
        PendingIntent calendarPI = deepLinkPI("eeis://calendar", 21);
        PendingIntent donatePI   = deepLinkPI("eeis://donate",   22);
        PendingIntent contentPI  = deepLinkPI("eeis://home",     30);

        int smallIcon = getResources().getIdentifier(
                "ic_stat_notify_icon", "drawable", getPackageName());
        if (smallIcon == 0) smallIcon = getApplicationInfo().icon;

        // Quote appears in notification body whenever quotesEnabled is true (regardless of splash)
        NotificationCompat.BigTextStyle bigTextStyle = new NotificationCompat.BigTextStyle();
        if (currentQuotes && !currentQuoteText.isEmpty()) {
            String quoteBody = "\u201C" + currentQuoteText + "\u201D"
                    + (currentQuoteRef.isEmpty() ? "" : "\n\u2014 " + currentQuoteRef);
            bigTextStyle
                    .setBigContentTitle(currentPrayerName + " Prayer Time 🕌")
                    .bigText(quoteBody)
                    .setSummaryText(currentBody);
        } else {
            bigTextStyle.bigText(currentBody + "\n\nEpsom & Ewell Islamic Society");
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setColor(0xFF0B5EA8)
                .setColorized(true)
                .setContentTitle(currentPrayerName + " Prayer Time")
                .setContentText(currentBody)
                .setSubText("EEIS · Epsom & Ewell Islamic Society")
                .setStyle(bigTextStyle)
                .setContentIntent(contentPI)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setShowWhen(false)
                .setSound(null)
                .setVibrate(new long[]{0, 500, 250, 500})
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPI)
                .addAction(pauseResumeIcon, pauseResumeLabel, pauseResumePI)
                .addAction(android.R.drawable.ic_dialog_map, "Qibla", qiblaPI)
                .addAction(android.R.drawable.ic_menu_my_calendar, "Calendar", calendarPI)
                .addAction(android.R.drawable.ic_menu_agenda, "Donate", donatePI);

        // Only show full-screen lock-screen overlay when Splash is enabled.
        // Without splash, notification appears as a normal heads-up / notification shade entry.
        if (currentSplash) {
            builder.setFullScreenIntent(fullScreenPI, true);
        }

        if (mediaSession != null) {
            builder.setStyle(new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
                    .setShowCancelButton(false));
        }

        return builder.build();
    }

    // ─── PendingIntent helpers ────────────────────────────────────────────────

    private PendingIntent servicePI(String action, int requestCode) {
        Intent i = new Intent(this, EeisAlarmService.class);
        i.setAction(action);
        return PendingIntent.getService(this, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent deepLinkPI(String uri, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void startForegroundWithType(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, notification);
        }
    }

    private static String nvl(String s, String def) {
        return s != null ? s : def;
    }
}
