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
            String quoteArabic,
            String customSoundUri,
            String beginsTime,
            String jamaatTime,
            boolean useJamaat,
            boolean popup,
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
                    loop, splash, flash, vibrate, quotes, quoteText, quoteRef, quoteArabic, customSoundUri,
                    beginsTime, jamaatTime, useJamaat, popup);

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

    // Returns the prayer + timestamp of the last time the native full-screen flash actually
    // showed (written by EeisAlarmActivity). JS uses this to decide whether to also show the
    // in-app flash card on app open (it skips the card if the native flash already showed).
    @ReactMethod
    public void getLastFlash(Promise promise) {
        try {
            android.content.SharedPreferences p = getReactApplicationContext()
                    .getSharedPreferences("eeis_alarm", Context.MODE_PRIVATE);
            WritableMap map = Arguments.createMap();
            map.putString("prayer", p.getString("lastFlashPrayer", ""));
            map.putDouble("atMs",   (double) p.getLong("lastFlashAtMs", 0));
            promise.resolve(map);
        } catch (Exception e) {
            promise.resolve(null);
        }
    }

    // Re-show the native flash/quote screen for the last alarm if it is still "fresh" (fired within
    // the last hour), was a SPLASH alarm, and has NOT been dismissed. Called by the app on open so
    // a user who got only a notification (device unlocked + in another app) still sees the flash
    // when they switch to EEIS. Resolves true if shown, false otherwise.
    // Re-show the native pop-up for the last alarm if: it has NOT been dismissed, it was a pop-up
    // occurrence (Notify||Quote||Screen Flash), and it fired at/after `sinceMs` (the start of the
    // CURRENT prayer's window, computed in JS). This bounds the re-show to "until the next prayer":
    // once the next prayer begins, JS passes a later `sinceMs`, so the old occurrence no longer
    // qualifies. Resolves true if shown.
    @ReactMethod
    public void showPendingFlash(double sinceMs, Promise promise) {
        try {
            Context ctx = getReactApplicationContext();
            android.content.SharedPreferences p =
                    ctx.getSharedPreferences("eeis_alarm", Context.MODE_PRIVATE);
            boolean dismissed = p.getBoolean("occDismissed", true);
            boolean splash    = p.getBoolean("occSplash", false);
            boolean popup     = p.getBoolean("occPopup", splash);
            long fireMs       = p.getLong("occFireMs", 0);
            if (dismissed || !popup || fireMs == 0 || fireMs < (long) sinceMs) {
                promise.resolve(false);
                return;
            }
            Intent i = new Intent(ctx, EeisAlarmActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            i.putExtra(EeisAlarmActivity.EXTRA_PRAYER_NAME, p.getString("occPrayer", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_BODY,        p.getString("occBody", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_ALARM_ID,    p.getString("occAlarmId", "alarm"));
            // Strobe only if this occurrence had Screen Flash; otherwise the pop-up just appears.
            i.putExtra(EeisAlarmActivity.EXTRA_SPLASH,       splash);
            i.putExtra(EeisAlarmActivity.EXTRA_QUOTE_TEXT,   p.getString("occQuoteText", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_QUOTE_REF,    p.getString("occQuoteRef", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_QUOTE_ARABIC, p.getString("occQuoteArabic", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_BEGINS_TIME,  p.getString("occBegins", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_JAMAAT_TIME,  p.getString("occJamaat", ""));
            i.putExtra(EeisAlarmActivity.EXTRA_USE_JAMAAT,   p.getBoolean("occUseJamaat", false));
            // No audio is playing on a re-show after Stop/auto-stop → show a Close button (not Pause).
            i.putExtra(EeisAlarmActivity.EXTRA_HAS_AUDIO,    EeisAlarmService.sIsPlaying);
            ctx.startActivity(i);
            promise.resolve(true);
        } catch (Exception e) {
            promise.resolve(false);
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
            String quoteArabic,
            String customSoundUri,
            String beginsTime,
            String jamaatTime,
            boolean useJamaat,
            boolean popup) {

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
        intent.putExtra(EeisAlarmService.EXTRA_QUOTE_ARABIC,     quoteArabic != null ? quoteArabic : "");
        intent.putExtra(EeisAlarmService.EXTRA_CUSTOM_SOUND_URI, customSoundUri != null ? customSoundUri : "");
        intent.putExtra(EeisAlarmService.EXTRA_BEGINS_TIME,      beginsTime != null ? beginsTime : "");
        intent.putExtra(EeisAlarmService.EXTRA_JAMAAT_TIME,      jamaatTime != null ? jamaatTime : "");
        intent.putExtra(EeisAlarmService.EXTRA_USE_JAMAAT,       useJamaat);
        intent.putExtra(EeisAlarmService.EXTRA_POPUP,           popup);

        int requestCode = alarmId.hashCode();
        return PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
