import { useEffect } from 'react';
import { Platform, Linking, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertSettings } from './useAlertSettings';
import { getPrayerDataForDate, getDateKey, timeToMinutes, isBST } from './usePrayerTimes';
import { SoundKey, NOTIFICATION_SOUND_FILE } from '../data/soundOptions';

// ─── Channel architecture ─────────────────────────────────────────────────────
// Android 8+ locks the sound at the *channel* level — individual notifications
// cannot override it. So we create one channel per possible sound (13 sounds +
// 1 silent = 14 channels total). Each channel has bypassDnd: true so every
// prayer can ring through Do Not Disturb regardless of which sound is chosen.
// Channel IDs are stable strings so Android doesn't create duplicates on re-launch.

const CHANNEL_BASE = 'eeis-prayers';

// All sound keys that need their own channel
const SOUND_KEYS: SoundKey[] = [
  'fajr_adhan_dua', 'awaken_dua', 'ayatul_kursi',
  'gentle_waves', 'ocean_waves', 'forest_birds',
  'adhan', 'notify_1', 'notify_2', 'notify_3',
  'notify_4', 'notify_5', 'notify_6',
];

function channelIdForSound(soundKey: SoundKey): string {
  if (soundKey === 'none') return `${CHANNEL_BASE}-silent`;
  return `${CHANNEL_BASE}-${soundKey}`;
}

// ─── Permissions & setup ──────────────────────────────────────────────────────

// Bump this string whenever channel config changes (sound, importance, bypassDnd).
// On first launch after a version bump, ALL channels are deleted so Android recreates
// them fresh — Android silently ignores property updates on already-existing channels.
const CHANNEL_VERSION = 'v3';

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // First run of this channel version: wipe ALL channels so Android creates fresh
  // ones with the correct sounds. Property updates on existing channels are ignored.
  const done = await AsyncStorage.getItem(`channels_setup_${CHANNEL_VERSION}`);
  if (!done) {
    const toDelete = [
      'fajr-alarm', CHANNEL_BASE, `${CHANNEL_BASE}-silent`,
      ...SOUND_KEYS.map(channelIdForSound),
    ];
    for (const id of toDelete) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    }
    await AsyncStorage.setItem(`channels_setup_${CHANNEL_VERSION}`, 'true');
  }

  // Silent channel — for notify-only (no sound selected)
  await Notifications.setNotificationChannelAsync(`${CHANNEL_BASE}-silent`, {
    name: 'EEIS Prayer Times',
    importance: Notifications.AndroidImportance.DEFAULT,
    bypassDnd: false,
    enableVibrate: true,
    sound: null,
  });

  // One channel per sound — sound is baked in at channel-creation time
  // Android ignores per-notification sound; only the channel sound matters
  for (const key of SOUND_KEYS) {
    const soundFile = NOTIFICATION_SOUND_FILE[key];
    if (!soundFile) continue;
    await Notifications.setNotificationChannelAsync(channelIdForSound(key), {
      name: 'EEIS Prayer Times',
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      enableVibrate: true,
      vibrationPattern: [0, 500, 250, 500],
      // Full Android resource URI — bypasses any filename parsing in expo-notifications
      sound: `android.resource://com.eeis.prayertimes/raw/${key}`,
    });
  }
}

export async function setupNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync('PRAYER_ALERT', [
    {
      identifier: 'STOP_SOUND',
      buttonTitle: '⏹ Stop Sound',
      options: {
        isDestructive: true,
        isAuthenticationRequired: false,
        opensAppToForeground: false,
      },
    },
  ]);
}

// ─── Universal battery optimisation (all Android OEMs) ───────────────────────
// Uses Android's own REQUEST_IGNORE_BATTERY_OPTIMIZATIONS intent — shows the
// OS's native "Allow app to always run in background?" dialog. Works identically
// on Samsung, Xiaomi, Huawei, OnePlus, Oppo, Motorola, Google Pixel, etc.

export async function requestBatteryOptimisationExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: 'package:com.eeis.prayertimes' },
    );
  } catch {
    Linking.openSettings();
  }
}

export async function promptBatteryOptimisationOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const shown = await AsyncStorage.getItem('battery_prompt_shown');
  if (shown) return;
  await AsyncStorage.setItem('battery_prompt_shown', 'true');

  Alert.alert(
    '🔋 Keep Prayer Alarms Reliable',
    'Android can stop prayer alerts to save battery, especially overnight.\n\nTap "Allow" on the next screen to keep alarms active at all times.\n\nThis works on all Android phones.',
    [
      { text: 'Allow (Recommended)', onPress: requestBatteryOptimisationExemption },
      { text: 'Later', style: 'cancel' },
    ],
  );
}

// ─── Exact alarm permission (Android 12 / API 31-32 only, all brands) ─────────

export async function checkExactAlarmPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const apiLevel = Device.platformApiLevel ?? 0;
  if (apiLevel < 31 || apiLevel >= 33) return; // Only needed on Android 12

  const shown = await AsyncStorage.getItem('exact_alarm_prompt_shown');
  if (shown) return;
  await AsyncStorage.setItem('exact_alarm_prompt_shown', 'true');

  Alert.alert(
    '⏰ Allow Precise Prayer Alarms',
    'Your Android version requires one extra permission for alarms to fire at the exact second.\n\nTap "Open Settings", then enable "EEIS Prayer Times" under Alarms & Reminders.',
    [
      {
        text: 'Open Settings',
        onPress: async () => {
          try {
            await IntentLauncher.startActivityAsync(
              'android.settings.REQUEST_SCHEDULE_EXACT_ALARM',
            );
          } catch {
            Linking.openSettings();
          }
        },
      },
      { text: 'Later', style: 'cancel' },
    ],
  );
}

// ─── Test alarm ───────────────────────────────────────────────────────────────
// Fires a real notification 60 seconds from now. Sound key and loop setting
// are stored in the data field so the foreground listener can play via expo-av.

export async function scheduleTestNotification(settings: AlertSettings): Promise<void> {
  const soundKey = settings.fajr.sound as SoundKey;
  const hasSound  = soundKey !== 'none';
  const trigger   = new Date(Date.now() + 60_000);

  // iOS: native sound filename; Android: channel handles sound
  const iosSound = hasSound ? (NOTIFICATION_SOUND_FILE[soundKey] ?? true) : false;

  await Notifications.scheduleNotificationAsync({
    identifier: 'test_prayer_alarm',
    content: {
      title: '🧪 Test Alarm',
      body: 'If you can hear this, prayer alarms are working correctly.',
      // Store sound info in data so foreground listener can pick it up
      data: { soundKey, loopEnabled: false },
      categoryIdentifier: hasSound ? 'PRAYER_ALERT' : undefined,
      ...(Platform.OS === 'android' && {
        android: { channelId: channelIdForSound(soundKey) },
      }),
      ...(Platform.OS === 'ios' && {
        sound: iosSound,
        interruptionLevel: 'timeSensitive',
      }),
    } as any,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
}

// ─── Main scheduler ───────────────────────────────────────────────────────────

export async function scheduleAllNotifications(settings: AlertSettings): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (settings.muteAll) return;

  const now  = new Date();
  const DAYS = 10;

  for (let i = 0; i < DAYS; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const prayerData = getPrayerDataForDate(date);
    if (!prayerData) continue;

    const bst      = isBST(date);
    const isFriday = date.getDay() === 5;
    const dateKey  = getDateKey(date);

    const schedule = async (
      id: string,
      title: string,
      body: string,
      minutesSinceMidnight: number,
      soundKey: SoundKey,
      loopEnabled: boolean = false,
    ) => {
      const trigger = new Date(date);
      trigger.setHours(
        Math.floor(minutesSinceMidnight / 60),
        minutesSinceMidnight % 60,
        0, 0,
      );
      if (trigger <= now) return;

      const hasSound  = soundKey !== 'none';
      // iOS needs the filename; Android ignores this in favour of the channel sound
      const iosSound  = hasSound ? (NOTIFICATION_SOUND_FILE[soundKey] ?? true) : false;

      await Notifications.scheduleNotificationAsync({
        identifier: `${id}_${dateKey}`,
        content: {
          title,
          body,
          // Sound key stored in data so the foreground listener can use expo-av
          data: { soundKey, loopEnabled },
          categoryIdentifier: hasSound ? 'PRAYER_ALERT' : undefined,
          // Android: route to the channel whose sound matches the user's selection
          ...(Platform.OS === 'android' && {
            android: { channelId: channelIdForSound(soundKey) },
          }),
          // iOS: native sound file + Time-Sensitive breaks through Focus modes
          ...(Platform.OS === 'ios' && {
            sound: iosSound,
            interruptionLevel: 'timeSensitive',
          }),
        } as any,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
      });
    };

    // FAJR
    if (!settings.muteNotifications && settings.fajr.notifyEnabled) {
      await schedule(
        'fajr', 'Fajr 🌙',
        `Begins ${prayerData.fajr[0]} · Jama'at ${prayerData.fajr[1]}`,
        timeToMinutes(prayerData.fajr[0]),
        settings.fajr.sound as SoundKey,
        !!(settings.fajr as any).loopEnabled,
      );
    }

    // SHURUQ
    if (!settings.muteNotifications && settings.shuruq.notifyEnabled) {
      const shuruqM  = timeToMinutes(prayerData.shuruq);
      const triggerM = Math.max(shuruqM - settings.shuruq.offsetMinutes, 0);
      const label    = settings.shuruq.offsetMinutes > 0
        ? `Sunrise at ${prayerData.shuruq} · in ${settings.shuruq.offsetMinutes} min`
        : `Shuruq · Sunrise at ${prayerData.shuruq}`;
      await schedule(
        'shuruq', 'Shuruq ☀️', label, triggerM,
        settings.shuruq.sound as SoundKey,
        !!(settings.shuruq as any).loopEnabled,
      );
    }

    // DHUHR (non-Friday)
    if (!isFriday && !settings.muteNotifications && settings.dhuhr.notifyEnabled) {
      await schedule(
        'dhuhr', 'Dhuhr',
        `Begins ${prayerData.dhuhr[0]} · Jama'at ${prayerData.dhuhr[1]}`,
        timeToMinutes(prayerData.dhuhr[0]),
        settings.dhuhr.sound as SoundKey,
      );
    }

    // JUMMAH (Friday only)
    if (isFriday && !settings.muteNotifications && settings.jummah.notifyEnabled) {
      const j1 = bst ? '13:15' : '12:40';
      const j2 = bst ? '13:50' : '13:15';
      if (settings.jummah.jamaat1) {
        const triggerM = Math.max(timeToMinutes(j1) - settings.jummah.offsetMinutes, 0);
        await schedule(
          'jummah1', 'Jummah',
          `1st Jama'at at ${j1} · in ${settings.jummah.offsetMinutes} min`,
          triggerM,
          settings.jummah.sound as SoundKey,
        );
      }
      if (settings.jummah.jamaat2) {
        const triggerM = Math.max(timeToMinutes(j2) - settings.jummah.offsetMinutes, 0);
        await schedule(
          'jummah2', 'Jummah',
          `2nd Jama'at at ${j2} · in ${settings.jummah.offsetMinutes} min`,
          triggerM,
          settings.jummah.sound as SoundKey,
        );
      }
    }

    // ASR
    if (!settings.muteNotifications && settings.asr.notifyEnabled) {
      await schedule(
        'asr', 'Asr',
        `Begins ${prayerData.asr[0]} · Jama'at ${prayerData.asr[1]}`,
        timeToMinutes(prayerData.asr[0]),
        settings.asr.sound as SoundKey,
      );
    }

    // MAGHRIB
    if (!settings.muteNotifications && settings.maghrib.notifyEnabled) {
      const maghribM = timeToMinutes(prayerData.maghrib);
      const triggerM = Math.max(maghribM - settings.maghrib.offsetMinutes, 0);
      const label    = settings.maghrib.offsetMinutes > 0
        ? `Maghrib at ${prayerData.maghrib} · in ${settings.maghrib.offsetMinutes} min`
        : `Maghrib · Jama'at ${prayerData.maghrib}`;
      await schedule('maghrib', 'Maghrib', label, triggerM, settings.maghrib.sound as SoundKey);
    }

    // ISHA
    if (!settings.muteNotifications && settings.isha.notifyEnabled) {
      await schedule(
        'isha', 'Isha',
        `Begins ${prayerData.isha[0]} · Jama'at ${prayerData.isha[1]}`,
        timeToMinutes(prayerData.isha[0]),
        settings.isha.sound as SoundKey,
      );
    }
  }
}

export function useNotificationScheduler(settings: AlertSettings, loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;
    scheduleAllNotifications(settings).catch(e =>
      console.warn('[Notifications] schedule error:', e)
    );
  }, [settings, loaded]);
}
