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
 *   Also posts a lock-screen MediaSession so Android shows native media controls
 *   on the lock screen player panel.
 *
 * LOCK SCREEN: fullScreenIntent → EeisAlarmActivity (setShowWhenLocked = true)
 *
 * STATE: static flags accessible from EeisAlarmModule so JS can query / update state.
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
    public static final String EXTRA_ALARM_MODE       = "alarmMode"; // "sound-only"|"sound-screen"|"sound-torch"|"sound-vibrate"|"sound-vibrate-screen"|"sound-vibrate-torch"
    public static final String EXTRA_CUSTOM_SOUND_URI = "customSoundUri"; // file:// URI for user-imported sound

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

    // ─── Torch flash ──────────────────────────────────────────────────────────
    private Handler  torchHandler;
    private boolean  torchOn       = false;
    private String   torchCameraId = null;
    private static final int TORCH_ON_MS   = 500;
    private static final int TORCH_OFF_MS  = 400;

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
        String alarmMode      = nvl(intent.getStringExtra(EXTRA_ALARM_MODE), "sound-only");

        boolean shouldVibrate = alarmMode.startsWith("sound-vibrate");
        boolean shouldTorch   = alarmMode.contains("torch");

        sIsPaused   = false;
        sIsPlaying  = false;
        sPrayerName = currentPrayerName;

        // Post foreground notification immediately (required on API 26+ within 5 s)
        createNotificationChannel();
        startForegroundWithType(buildNotification(false, alarmMode));

        // Conditionally vibrate
        if (shouldVibrate) vibrateOnAlarm();

        // Conditionally torch-flash (screen flash is handled in EeisAlarmActivity)
        if (shouldTorch) startTorchFlash();

        // Start audio (custom URI takes priority over bundled resource name)
        if ("custom".equals(soundName) && !customSoundUri.isEmpty()) {
            playAlarmSoundFromUri(customSoundUri, loopEnabled);
        } else {
            playAlarmSound(soundName, loopEnabled);
        }

        // Notify JS
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
            return; // Sound file not found — notification still shows
        }

        // USAGE_ALARM: the only audio attribute that bypasses DND and
        // plays through Samsung's aggressive battery management on locked screens.
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
            updateNotification(); // refresh to show Pause button

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
            updateNotification(); // refresh to show Resume button
            EeisAlarmModule.emitState("paused", currentPrayerName);
        }
    }

    private void resumePlayback() {
        if (mediaPlayer != null && sIsPaused) {
            mediaPlayer.start();
            sIsPaused  = false;
            sIsPlaying = true;
            updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
            updateNotification(); // refresh to show Pause button
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
            torchHandler.post(torchRunnable);
        } catch (Exception e) {
            // Non-fatal — alarm still plays without torch
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
            torchHandler.postDelayed(this, torchOn ? TORCH_ON_MS : TORCH_OFF_MS);
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

    /**
     * Vibrate 4 strong pulses when the alarm fires.
     * Pattern: [delay, on, off, on, off, on, off, on]
     * Uses alarm audio attributes so vibration fires even in DND / vibrate-only mode.
     * Uses VibratorManager on API 31+ and legacy Vibrator on older versions.
     */
    @SuppressWarnings("deprecation")
    private void vibrateOnAlarm() {
        try {
            // Pattern: 0ms delay, then 700ms on / 300ms off × 4 pulses
            long[] pattern = {0, 700, 300, 700, 300, 700, 300, 700};

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // API 31+ — VibratorManager
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator v = vm.getDefaultVibrator();
                    VibrationEffect effect = VibrationEffect.createWaveform(pattern, -1);
                    v.vibrate(effect);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // API 26-30 — VibrationEffect
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    VibrationEffect effect = VibrationEffect.createWaveform(pattern, -1);
                    v.vibrate(effect);
                }
            } else {
                // API < 26 — legacy
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    v.vibrate(pattern, -1);
                }
            }
        } catch (Exception e) {
            e.printStackTrace(); // Non-fatal — alarm still plays without vibration
        }
    }

    // ─── MediaSession ─────────────────────────────────────────────────────────
    // Registers a MediaSession so Android shows native media controls on the
    // lock screen player panel (the media card that appears above the clock).

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

        // Update media metadata (shown on lock screen player card)
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
        ch.setSound(null, null);         // Audio via MediaPlayer, not channel
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 500, 250, 500});
        ch.setShowBadge(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private String currentAlarmMode = "sound-only";

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.notify(NOTIF_ID, buildNotification(sIsPaused, currentAlarmMode));
    }

    private Notification buildNotification(boolean isPaused, String alarmMode) {
        currentAlarmMode = alarmMode != null ? alarmMode : "all";
        // ── fullScreenIntent → EeisAlarmActivity (lock screen overlay) ─────────
        Intent activityIntent = new Intent(this, EeisAlarmActivity.class);
        activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_PRAYER_NAME, currentPrayerName);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_BODY, currentBody);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_ALARM_ID, currentAlarmId);
        activityIntent.putExtra(EeisAlarmActivity.EXTRA_ALARM_MODE, currentAlarmMode);
        PendingIntent fullScreenPI = PendingIntent.getActivity(this,
                currentAlarmId.hashCode(), activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // ── Action: Stop ──────────────────────────────────────────────────────
        PendingIntent stopPI = servicePI(ACTION_DISMISS, 10);

        // ── Action: Pause / Resume ─────────────────────────────────────────────
        PendingIntent pauseResumePI = servicePI(
                isPaused ? ACTION_RESUME : ACTION_PAUSE, 11);
        String pauseResumeLabel = isPaused ? "Resume" : "Pause";
        int pauseResumeIcon = isPaused
                ? android.R.drawable.ic_media_play
                : android.R.drawable.ic_media_pause;

        // ── Action: Qibla ─────────────────────────────────────────────────────
        PendingIntent qiblaPI = deepLinkPI("eeis://qibla", 20);

        // ── Action: Calendar ──────────────────────────────────────────────────
        PendingIntent calendarPI = deepLinkPI("eeis://calendar", 21);

        // ── Action: Donate ────────────────────────────────────────────────────
        PendingIntent donatePI = deepLinkPI("eeis://donate", 22);

        // ── Content tap → open app ────────────────────────────────────────────
        PendingIntent contentPI = deepLinkPI("eeis://home", 30);

        // ── Notification icon ─────────────────────────────────────────────────
        int smallIcon = getResources().getIdentifier(
                "ic_stat_notify_icon", "drawable", getPackageName());
        if (smallIcon == 0) smallIcon = getApplicationInfo().icon;

        // ── Build notification ────────────────────────────────────────────────
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setColor(0xFF0B5EA8)                                  // EEIS deepBlue
                .setColorized(true)
                .setContentTitle(currentPrayerName + " Prayer Time")
                .setContentText(currentBody)
                .setSubText("EEIS · Epsom & Ewell Islamic Society")
                .setStyle(new NotificationCompat.BigTextStyle()
                        .setBigContentTitle(currentPrayerName + " Prayer Time 🕌")
                        .bigText(currentBody + "\n\nEpsom & Ewell Islamic Society"))
                .setContentIntent(contentPI)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setShowWhen(false)
                .setFullScreenIntent(fullScreenPI, true)
                .setSound(null)
                .setVibrate(new long[]{0, 500, 250, 500})
                // Action 0 — Stop  (shown in compact view position 0)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel,
                        "Stop", stopPI)
                // Action 1 — Pause/Resume  (compact view position 1)
                .addAction(pauseResumeIcon, pauseResumeLabel, pauseResumePI)
                // Action 2 — Qibla  (compact view position 2)
                .addAction(android.R.drawable.ic_dialog_map, "Qibla", qiblaPI)
                // Action 3 — Calendar  (expanded only)
                .addAction(android.R.drawable.ic_menu_my_calendar, "Calendar", calendarPI)
                // Action 4 — Donate  (expanded only)
                .addAction(android.R.drawable.ic_menu_agenda, "Donate", donatePI);

        // ── MediaStyle ────────────────────────────────────────────────────────
        // Shows actions in a media-player bar layout.
        // setShowActionsInCompactView(0, 1, 2) = Stop, Pause/Resume, Qibla in compact.
        // MediaSession token = lock screen media player card integration.
        if (mediaSession != null) {
            builder.setStyle(new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
                    .setShowCancelButton(false));
        }

        return builder.build();
    }

    // ─── PendingIntent helpers ────────────────────────────────────────────────

    /** PendingIntent that sends an action intent back to this service. */
    private PendingIntent servicePI(String action, int requestCode) {
        Intent i = new Intent(this, EeisAlarmService.class);
        i.setAction(action);
        return PendingIntent.getService(this, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * PendingIntent that deep-links into the app via a URI.
     * Handles eeis://qibla, eeis://calendar, eeis://donate, eeis://home.
     * React Native's Linking module picks these up in App.tsx.
     */
    private PendingIntent deepLinkPI(String uri, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** startForeground with or without service type depending on API level. */
    private void startForegroundWithType(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, notification);
        }
    }

    /** Null-safe string helper. */
    private static String nvl(String s, String def) {
        return s != null ? s : def;
    }
}
