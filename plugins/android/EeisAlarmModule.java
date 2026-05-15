package com.eeis.prayertimes;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Native module exposed to JavaScript as NativeModules.EeisAlarm.
 *
 * Provides scheduleAlarm / cancelAlarm / stopCurrentAlarm / pauseAlarm / resumeAlarm
 * backed by AlarmManager.setExactAndAllowWhileIdle — the only reliable alarm API on
 * Android 6+ that fires even when the device is in Doze mode.
 *
 * v18: per-prayer effect booleans (splash, flash, vibrate, quotes) replace global alarmMode string.
 *
 * State changes are emitted to JS via DeviceEventEmitter 'EeisAlarmStateChange':
 *   { state: 'playing' | 'paused' | 'stopped', prayerName: string }
 */
public class EeisAlarmModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME   = "EeisAlarm";
    private static final String EVENT_NAME    = "EeisAlarmStateChange";

    private static volatile ReactApplicationContext sReactContext;

    public EeisAlarmModule(ReactApplicationContext reactContext) {
        super(reactContext);
        sReactContext = reactContext;
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ─── Static event emitter (called by EeisAlarmService) ────────────────────

    public static void emitState(String state, String prayerName) {
        ReactApplicationContext ctx = sReactContext;
        if (ctx == null || !ctx.hasActiveReactInstance()) return;
        try {
            WritableMap params = Arguments.createMap();
            params.putString("state", state);
            params.putString("prayerName", prayerName != null ? prayerName : "");
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
               .emit(EVENT_NAME, params);
        } catch (Exception ignored) {}
    }

    // ─── React methods ────────────────────────────────────────────────────────

    /**
     * Schedule a prayer alarm.
     *
     * @param alarmId       Unique string ID (e.g. "fajr_2026-05-14"). Used to cancel later.
     * @param epochMs       Unix timestamp in milliseconds when the alarm should fire.
     * @param soundName     File name without extension (e.g. "adhan", "notify_1"). Must exist in res/raw/.
     * @param prayerName    Display name (e.g. "Fajr").
     * @param bodyText      Subtitle text (e.g. "Begins 04:12 · Jama'at 05:00").
     * @param loop          Whether to loop the audio until dismissed.
     * @param splash        Whether to show 3× white screen flash then reveal alarm content.
     * @param flash         Whether to strobe the rear torch LED.
     * @param vibrate       Whether to vibrate on alarm fire.
     * @param quotes        Whether to show a Quran quote on the alarm screen or in notification.
     * @param quoteText     The quote text (empty string if quotes disabled or unavailable).
     * @param quoteRef      The Quran reference (e.g. "Al-Baqara 2:255").
     * @param customSoundUri file:// URI for user-imported audio, empty string otherwise.
     */
    @ReactMethod
    public void scheduleAlarm(
            String alarmId,
            double epochMs,
            String soundName,
            String prayerName,
            String bodyText,
            boolean loop,
            boolean splash,
            boolean flash,
            boolean vibrate,
            boolean quotes,
            String quoteText,
            String quoteRef,
            String customSoundUri,
            Promise promise) {

        try {
            Context context = getReactApplicationContext();
            AlarmManager alarmManager =
                    (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) {
                promise.reject("ERR_NO_ALARM_MANAGER", "AlarmManager not available");
                return;
            }

            PendingIntent pi = buildPendingIntent(
                    context, alarmId, soundName, prayerName, bodyText,
                    loop, splash, flash, vibrate, quotes, quoteText, quoteRef, customSoundUri);

            long triggerAt = (long) epochMs;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("ERR_SCHEDULE_ALARM", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void cancelAlarm(String alarmId, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            AlarmManager alarmManager =
                    (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) {
                promise.resolve(null);
                return;
            }

            Intent intent = new Intent(context, EeisAlarmReceiver.class);
            intent.setAction("com.eeis.prayertimes.PRAYER_ALARM");

            int requestCode = alarmId.hashCode();
            PendingIntent pi = PendingIntent.getBroadcast(
                    context, requestCode, intent,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);

            if (pi != null) {
                alarmManager.cancel(pi);
                pi.cancel();
            }

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("ERR_CANCEL_ALARM", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopCurrentAlarm(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent stopIntent = new Intent(context, EeisAlarmService.class);
            stopIntent.setAction(EeisAlarmService.ACTION_DISMISS);
            context.startService(stopIntent);
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null);
        }
    }

    @ReactMethod
    public void pauseAlarm(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent i = new Intent(context, EeisAlarmService.class);
            i.setAction(EeisAlarmService.ACTION_PAUSE);
            context.startService(i);
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null);
        }
    }

    @ReactMethod
    public void resumeAlarm(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent i = new Intent(context, EeisAlarmService.class);
            i.setAction(EeisAlarmService.ACTION_RESUME);
            context.startService(i);
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null);
        }
    }

    @ReactMethod
    public void getAlarmState(Promise promise) {
        try {
            WritableMap map = Arguments.createMap();
            map.putBoolean("isPlaying",  EeisAlarmService.sIsPlaying);
            map.putBoolean("isPaused",   EeisAlarmService.sIsPaused);
            map.putString("prayerName",  EeisAlarmService.sPrayerName != null
                    ? EeisAlarmService.sPrayerName : "");
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("ERR_GET_STATE", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void checkFullScreenIntentPermission(Promise promise) {
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = getReactApplicationContext()
                    .getSystemService(NotificationManager.class);
            promise.resolve(nm != null && nm.canUseFullScreenIntent());
        } else {
            promise.resolve(true);
        }
    }

    @ReactMethod
    public void openFullScreenIntentSettings(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                Intent intent = new Intent(
                        "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
                        Uri.parse("package:" + getReactApplicationContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
            }
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null);
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────

    private PendingIntent buildPendingIntent(
            Context context,
            String alarmId,
            String soundName,
            String prayerName,
            String bodyText,
            boolean loop,
            boolean splash,
            boolean flash,
            boolean vibrate,
            boolean quotes,
            String quoteText,
            String quoteRef,
            String customSoundUri) {

        Intent intent = new Intent(context, EeisAlarmReceiver.class);
        intent.setAction("com.eeis.prayertimes.PRAYER_ALARM");
        intent.putExtra(EeisAlarmService.EXTRA_ALARM_ID,         alarmId);
        intent.putExtra(EeisAlarmService.EXTRA_SOUND,            soundName);
        intent.putExtra(EeisAlarmService.EXTRA_PRAYER_NAME,      prayerName);
        intent.putExtra(EeisAlarmService.EXTRA_BODY,             bodyText);
        intent.putExtra(EeisAlarmService.EXTRA_LOOP,             loop);
        intent.putExtra(EeisAlarmService.EXTRA_SPLASH,           splash);
        intent.putExtra(EeisAlarmService.EXTRA_FLASH,            flash);
        intent.putExtra(EeisAlarmService.EXTRA_VIBRATE,          vibrate);
        intent.putExtra(EeisAlarmService.EXTRA_QUOTES,           quotes);
        intent.putExtra(EeisAlarmService.EXTRA_QUOTE_TEXT,       quoteText  != null ? quoteText  : "");
        intent.putExtra(EeisAlarmService.EXTRA_QUOTE_REF,        quoteRef   != null ? quoteRef   : "");
        intent.putExtra(EeisAlarmService.EXTRA_CUSTOM_SOUND_URI, customSoundUri != null ? customSoundUri : "");

        int requestCode = alarmId.hashCode();
        return PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
