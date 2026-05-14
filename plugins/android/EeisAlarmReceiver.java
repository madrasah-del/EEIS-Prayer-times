package com.eeis.prayertimes;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/**
 * Fired by AlarmManager at prayer time.
 * Wakes the device (RTC_WAKEUP alarm type) and starts the foreground alarm service.
 * Keeping this class minimal — all audio/UI logic lives in EeisAlarmService.
 */
public class EeisAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        // Forward all extras (sound, prayer name, body, loop flag) to the service
        Intent serviceIntent = new Intent(context, EeisAlarmService.class);
        serviceIntent.putExtras(intent);

        // startForegroundService is required when targeting API 26+ to avoid
        // "app not in foreground" crash. ContextCompat handles the API version check.
        ContextCompat.startForegroundService(context, serviceIntent);
    }
}
