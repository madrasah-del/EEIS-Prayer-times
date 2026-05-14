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
 * State changes are emitted to JS via DeviceEventEmitter 'EeisAlarmStateChange':
 *   { state: 'playing' | 'paused' | 'stopped', prayerName: string }
 *
 * JS usage (Android only):
 *   import { NativeModules, DeviceEventEmitter } from 'react-native';
 *   const { EeisAlarm } = NativeModules;
 *
 *   await EeisAlarm.scheduleAlarm('fajr_2026-05-14', 1747184520000, 'adhan',
 *                                  'Fajr', 'Begins 04:12 · Jama\'at 05:00', false);
 *   await EeisAlarm.cancelAlarm('fajr_2026-05-14');
 *   await EeisAlarm.stopCurrentAlarm();
 *   await EeisAlarm.pauseAlarm();
 *   await EeisAlarm.resumeAlarm();
 *   const state = await EeisAlarm.getAlarmState(); // { isPlaying, isPaused, prayerName }
 *
 *   DeviceEventEmitter.addListener('EeisAlarmStateChange', ({ state, prayerName }) => { ... });
 */
public class EeisAlarmModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME   = "EeisAlarm";
    private static final String EVENT_NAME    = "EeisAlarmStateChange";

    // Stored so emitState() can reach the JS bridge from a static context
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
    // EeisAlarmService calls this whenever playback state changes.
    // It must be static because the service has no reference to the module instance.

    public static void emitState(String state, String prayerName) {
        ReactApplicationContext ctx = sReactContext;
        if (ctx == null || !ctx.hasActiveReactInstance()) return;
        try {
            WritableMap params = Arguments.createMap();
            params.putString("state", state);
            params.putString("prayerName", prayerName != null ? prayerName : "");
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
               .emit(EVENT_NAME, params);
        } catch (Exception ignored) {
            // Bridge may be torn down — safe to ignore
        }
    }

    // ─── React methods ────────────────────────────────────────────────────────

    /**
     * Schedule a prayer alarm.
     *
     * @param alarmId     Unique string ID (e.g. "fajr_2026-05-14"). Used to cancel later.
     * @param epochMs     Unix timestamp in milliseconds when the alarm should fire.
     * @param soundName   File name without extension (e.g. "adhan", "notify_1"). Must exist in res/raw/.
     * @param prayerName  Display name (e.g. "Fajr").
     * @param bodyText    Subtitle text (e.g. "Begins 04:12 · Jama'at 05:00").
     * @param loop        Whether to loop the audio until dismissed.
     */
    @ReactMethod
    public void scheduleAlarm(
            String alarmId,
            double epochMs,
            String soundName,
            String prayerName,
            String bodyText,
            boolean loop,
            String alarmMode,
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
                    context, alarmId, soundName, prayerName, bodyText, loop, alarmMode,
                    customSoundUri);

            long triggerAt = (long) epochMs;

            // setExactAndAllowWhileIdle fires even in Doze mode.
            // It's the correct API for alarm clocks on Android 6+ (API 23+).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,  // wake the device if sleeping
                        triggerAt,
                        pi);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("ERR_SCHEDULE_ALARM", e.getMessage(), e);
        }
    }

    /**
     * Cancel a previously scheduled alarm by its string ID.
     */
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

            // Reconstruct the same PendingIntent — AlarmManager matches by PendingIntent
            // equality (same requestCode). We don't need the extras to be the same to cancel.
            Intent intent = new Intent(context, EeisAlarmReceiver.class);
            intent.setAction("com.eeis.prayertimes.PRAYER_ALARM");

            int requestCode = alarmId.hashCode();
            PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    intent,
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

    /**
     * Stop any currently playing alarm audio (send dismiss action to the service).
     * Called when the user mutes all from the app UI.
     */
    @ReactMethod
    public void stopCurrentAlarm(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent stopIntent = new Intent(context, EeisAlarmService.class);
            stopIntent.setAction(EeisAlarmService.ACTION_DISMISS);
            context.startService(stopIntent);
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null); // Non-fatal — service may not be running
        }
    }

    /**
     * Pause the currently playing alarm audio.
     */
    @ReactMethod
    public void pauseAlarm(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent i = new Intent(context, EeisAlarmService.class);
            i.setAction(EeisAlarmService.ACTION_PAUSE);
            context.startService(i);
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null); // Non-fatal
        }
    }

    /**
     * Resume a paused alarm.
     */
    @ReactMethod
    public void resumeAlarm(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent i = new Intent(context, EeisAlarmService.class);
            i.setAction(EeisAlarmService.ACTION_RESUME);
            context.startService(i);
            promise.resolve(null);
        } catch (Exception e) {
            promise.resolve(null); // Non-fatal
        }
    }

    /**
     * Return the current alarm state synchronously (for initial state on component mount).
     * Returns { isPlaying: boolean, isPaused: boolean, prayerName: string }
     */
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

    /**
     * Returns true if USE_FULL_SCREEN_INTENT is granted.
     * Always true below Android 14 (API 34). On 14+ requires explicit user grant.
     */
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

    /**
     * Opens Settings so the user can grant USE_FULL_SCREEN_INTENT.
     * Android 14+ only — silently succeeds on older versions.
     */
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
            promise.resolve(null); // Non-fatal
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
            String alarmMode,
            String customSoundUri) {

        Intent intent = new Intent(context, EeisAlarmReceiver.class);
        intent.setAction("com.eeis.prayertimes.PRAYER_ALARM");
        intent.putExtra(EeisAlarmService.EXTRA_ALARM_ID,         alarmId);
        intent.putExtra(EeisAlarmService.EXTRA_SOUND,            soundName);
        intent.putExtra(EeisAlarmService.EXTRA_PRAYER_NAME,      prayerName);
        intent.putExtra(EeisAlarmService.EXTRA_BODY,             bodyText);
        intent.putExtra(EeisAlarmService.EXTRA_LOOP,             loop);
        intent.putExtra(EeisAlarmService.EXTRA_ALARM_MODE,       alarmMode != null ? alarmMode : "all");
        intent.putExtra(EeisAlarmService.EXTRA_CUSTOM_SOUND_URI, customSoundUri != null ? customSoundUri : "");

        // Use hashCode of alarmId as the unique requestCode.
        // This means same alarmId → same requestCode → AlarmManager updates in place.
        int requestCode = alarmId.hashCode();

        return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
