import { useEffect } from 'react';
import { Platform, Linking, Alert, NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertSettings } from './useAlertSettings';
import { getPrayerDataForDate, getDateKey, timeToMinutes, isBST } from './usePrayerTimes';
import { SoundKey, NOTIFICATION_SOUND_FILE } from '../data/soundOptions';
import { fetchQuotes, getNextQuote, QuotesData } from '../data/quotes';

// ─── Native alarm module (Android only) ──────────────────────────────────────
// On Android we bypass notification channel sound entirely and play audio via
// MediaPlayer with USAGE_ALARM (bypasses DND, works on Samsung locked screens).
// EeisAlarmModule is registered by withPrayerAlarmService config plugin.
// On iOS NativeModules.EeisAlarm is undefined — iOS uses expo-notifications.
const EeisAlarm: {
  scheduleAlarm(
    alarmId: string,
    epochMs: number,
    soundName: string,
    prayerName: string,
    bodyText: string,
    loop: boolean,
    splash: boolean,
    flash: boolean,
    vibrate: boolean,
    quotes: boolean,
    quoteText: string,
    quoteRef: string,
    customSoundUri: string,
    beginsTime: string,
    jamaatTime: string,
    useJamaat: boolean,
  ): Promise<void>;
  cancelAlarm(alarmId: string): Promise<void>;
  stopCurrentAlarm(): Promise<void>;
  pauseAlarm(): Promise<void>;
  resumeAlarm(): Promise<void>;
  getAlarmState(): Promise<{ isPlaying: boolean; isPaused: boolean; prayerName: string }>;
  checkFullScreenIntentPermission(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
} | undefined = NativeModules.EeisAlarm;

// ─── Channel architecture ─────────────────────────────────────────────────────
// Android 8+ locks the sound at the *channel* level — individual notifications
// cannot override it. So we create one channel per possible sound (13 sounds +
// 1 silent = 14 channels total). Each channel has bypassDnd: true so every
// prayer can ring through Do Not Disturb regardless of which sound is chosen.
// Channel IDs are stable strings so Android doesn't create duplicates on re-launch.

const CHANNEL_BASE = 'eeis-prayers';
// v5 prefix — completely fresh IDs that have NEVER existed on any device.
// Android locks channel sound at creation; Samsung One UI caches it even after
// deletion. Using never-before-seen IDs guarantees fresh creation every time.
const CHANNEL_V5 = 'eeis-alarm-v5';
const PACKAGE = 'com.eeis.prayertimes';

// All sound keys that need their own channel
const SOUND_KEYS: SoundKey[] = [
  'fajr_adhan_dua', 'awaken_dua', 'ayatul_kursi',
  'gentle_waves', 'ocean_waves', 'forest_birds',
  'adhan', 'notify_1', 'notify_2', 'notify_3',
  'notify_4', 'notify_5', 'notify_6',
];

function channelIdForSound(soundKey: SoundKey): string {
  if (soundKey === 'none') return `${CHANNEL_V5}-silent`;
  return `${CHANNEL_V5}-${soundKey}`;
}

// Build a name-based Android resource URI for a sound file.
// Samsung Android 16 ignores integer-ID-based URIs (android.resource://pkg/12345)
// but correctly resolves name-based URIs (android.resource://pkg/raw/adhan).
// expo-notifications always converts to the integer form — so we pass the full URI
// string directly, which expo-notifications forwards to NotificationChannel.setSound()
// without modification.
function soundUri(key: SoundKey): string {
  return `android.resource://${PACKAGE}/raw/${key}`;
}

// ─── Permissions & setup ──────────────────────────────────────────────────────

// Bump this string whenever channel config changes (sound, importance, bypassDnd).
// On first launch after a version bump, ALL channels are deleted so Android recreates
// them fresh — Android silently ignores property updates on already-existing channels.
const CHANNEL_VERSION = 'v5';

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
    // Delete every channel ID we've ever used across all versions
    const legacyIds = [
      'fajr-alarm',
      CHANNEL_BASE, `${CHANNEL_BASE}-silent`,
      // v4 IDs
      ...SOUND_KEYS.map(k => `${CHANNEL_BASE}-${k}`),
      // v5 IDs (in case a previous partial install left them with the wrong sound)
      `${CHANNEL_V5}-silent`,
      ...SOUND_KEYS.map(k => `${CHANNEL_V5}-${k}`),
    ];
    for (const id of legacyIds) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    }
    await AsyncStorage.setItem(`channels_setup_${CHANNEL_VERSION}`, 'true');
  }

  // Silent channel — for notify-only (no sound selected)
  await Notifications.setNotificationChannelAsync(`${CHANNEL_V5}-silent`, {
    name: 'EEIS Prayer Times',
    importance: Notifications.AndroidImportance.DEFAULT,
    bypassDnd: false,
    enableVibrate: true,
    sound: null,
  });

  // One channel per sound — sound is baked in at channel-creation time.
  // IMPORTANT: We pass the full name-based URI string directly.
  // expo-notifications forwards URI strings that start with "android.resource://"
  // unchanged to NotificationChannel.setSound(). Samsung Android 16 correctly
  // resolves name-based URIs (/raw/adhan) but has been observed to fail with the
  // integer-ID form that expo-notifications generates when given a bare filename.
  for (const key of SOUND_KEYS) {
    await Notifications.setNotificationChannelAsync(channelIdForSound(key), {
      name: 'EEIS Prayer Times',
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      enableVibrate: true,
      vibrationPattern: [0, 500, 250, 500],
      sound: soundUri(key),
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

// ─── Full-screen intent permission (Android 14+ / API 34+) ───────────────────
// USE_FULL_SCREEN_INTENT lets the alarm screen appear over the lock screen.
// Android 14+ requires explicit user grant via Settings → Special app access.
// Without it the fullScreenIntent is silently ignored (notification only shows
// in the status bar / drawer — the alarm Activity never launches).

export async function promptFullScreenIntentOnce(): Promise<void> {
  if (Platform.OS !== 'android' || !EeisAlarm) return;
  const apiLevel = Device.platformApiLevel ?? 0;
  if (apiLevel < 34) return; // Not needed below Android 14

  try {
    const granted = await EeisAlarm.checkFullScreenIntentPermission();
    if (granted) return;

    const shown = await AsyncStorage.getItem('fullscreen_intent_prompt_shown');
    if (shown) return;
    await AsyncStorage.setItem('fullscreen_intent_prompt_shown', 'true');

    Alert.alert(
      '🔒 Lock Screen Alarm',
      'To show the full prayer alarm screen when your phone is locked, EEIS needs the "Display over other apps" permission.\n\nTap "Grant Permission" to enable it.',
      [
        {
          text: 'Grant Permission',
          onPress: () => EeisAlarm?.openFullScreenIntentSettings().catch(() => Linking.openSettings()),
        },
        { text: 'Later', style: 'cancel' },
      ],
    );
  } catch {
    // Non-fatal — alarm still fires without the overlay
  }
}

// ─── Test alarm ───────────────────────────────────────────────────────────────
// Fires a real notification 30 seconds from now using Fajr settings.

export async function scheduleTestNotification(settings: AlertSettings): Promise<void> {
  if (settings.muteAll || settings.muteNotifications) return;
  const rawSoundKey = settings.fajr.sound as SoundKey;
  const soundKey  = settings.muteSounds ? 'none' : rawSoundKey;
  const hasSound  = soundKey !== 'none';
  const trigger   = new Date(Date.now() + 6_000);

  // Build test body using today's actual Fajr times so the alarm screen is representative
  const todayData = getPrayerDataForDate(new Date());
  const testPrayerName = 'FAJR';
  const testBody = todayData
    ? `Begins ${todayData.fajr[0]} · Jama'at ${todayData.fajr[1]}`
    : "Begins 04:12 · Jama'at 04:45";

  if (Platform.OS === 'android' && EeisAlarm) {
    // Android: test via native alarm module (same path as real alarms)
    let testQuoteText = '';
    let testQuoteRef  = '';
    if (settings.fajr.quotesEnabled) {
      const qdata = await fetchQuotes().catch(() => []);
      const qt = getNextQuote(qdata);
      testQuoteText = qt.text;
      testQuoteRef  = qt.reference;
    }
    const testFajrBegins = todayData ? todayData.fajr[0] : '04:12';
    const testFajrJamaat = todayData ? todayData.fajr[1] : '04:45';
    await EeisAlarm.scheduleAlarm(
      'test_prayer_alarm',
      trigger.getTime(),
      soundKey,           // already muted to 'none' if muteSounds is on
      testPrayerName,
      testBody,
      settings.fajr.loopEnabled,
      settings.fajr.splashEnabled,
      settings.fajr.flashEnabled,
      settings.fajr.vibrateEnabled,
      settings.fajr.quotesEnabled,
      testQuoteText,
      testQuoteRef,
      settings.fajr.customSoundUri ?? '',
      testFajrBegins,
      testFajrJamaat,
      false,
    ).catch(e => console.warn('[EeisAlarm] test schedule failed:', e));
    return;
  }

  // iOS / fallback
  const iosSound = hasSound ? (NOTIFICATION_SOUND_FILE[soundKey] ?? true) : false;
  await Notifications.scheduleNotificationAsync({
    identifier: 'test_prayer_alarm',
    content: {
      title: '🧪 Test Alarm',
      body: 'If you can hear this, prayer alarms are working correctly.',
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

// ─── Per-prayer test alarm ────────────────────────────────────────────────────
// Fires a 15-second alarm using the exact settings for a specific prayer.
// Only prayers that have notifyEnabled:true are shown in the UI.

export type PrayerTestKey = 'fajr' | 'shuruq' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | 'jummah';

export async function scheduleTestForPrayer(
  prayerKey: PrayerTestKey,
  settings: AlertSettings,
): Promise<void> {
  if (settings.muteAll || settings.muteNotifications) return;

  const trigger   = new Date(Date.now() + 6_000);
  const todayData = getPrayerDataForDate(new Date());

  // Extract per-prayer parameters
  let rawSoundKey: SoundKey;
  let loop:    boolean;
  let splash:  boolean;
  let flash:   boolean;
  let vibrate: boolean;
  let quotes:  boolean;
  let customSoundUri: string;
  let prayerName: string;
  let beginsTime: string;
  let jamaatTime: string;
  let useJamaat:  boolean;

  switch (prayerKey) {
    case 'fajr':
      rawSoundKey = settings.fajr.sound;     loop = settings.fajr.loopEnabled;
      splash = settings.fajr.splashEnabled;  flash = settings.fajr.flashEnabled;
      vibrate = settings.fajr.vibrateEnabled; quotes = settings.fajr.quotesEnabled;
      customSoundUri = settings.fajr.customSoundUri ?? '';
      useJamaat = settings.fajr.useJamaat ?? false;
      prayerName = 'FAJR';
      beginsTime = todayData?.fajr[0] ?? '04:12';
      jamaatTime = todayData?.fajr[1] ?? '04:45';
      break;
    case 'shuruq':
      rawSoundKey = settings.shuruq.sound;    loop = settings.shuruq.loopEnabled;
      splash = settings.shuruq.splashEnabled; flash = settings.shuruq.flashEnabled;
      vibrate = settings.shuruq.vibrateEnabled; quotes = settings.shuruq.quotesEnabled;
      customSoundUri = settings.shuruq.customSoundUri ?? '';
      useJamaat = false;
      prayerName = 'SHURUQ';
      beginsTime = todayData?.shuruq ?? '05:47';
      jamaatTime = '';
      break;
    case 'dhuhr':
      rawSoundKey = settings.dhuhr.sound;     loop = settings.dhuhr.loopEnabled;
      splash = settings.dhuhr.splashEnabled;  flash = settings.dhuhr.flashEnabled;
      vibrate = settings.dhuhr.vibrateEnabled; quotes = settings.dhuhr.quotesEnabled;
      customSoundUri = settings.dhuhr.customSoundUri ?? '';
      useJamaat = settings.dhuhr.useJamaat ?? false;
      prayerName = 'DHUHR';
      beginsTime = todayData?.dhuhr[0] ?? '13:05';
      jamaatTime = todayData?.dhuhr[1] ?? '13:30';
      break;
    case 'asr':
      rawSoundKey = settings.asr.sound;      loop = settings.asr.loopEnabled;
      splash = settings.asr.splashEnabled;   flash = settings.asr.flashEnabled;
      vibrate = settings.asr.vibrateEnabled; quotes = settings.asr.quotesEnabled;
      customSoundUri = settings.asr.customSoundUri ?? '';
      useJamaat = settings.asr.useJamaat ?? false;
      prayerName = 'ASR';
      beginsTime = todayData?.asr[0] ?? '16:48';
      jamaatTime = todayData?.asr[1] ?? '17:15';
      break;
    case 'maghrib':
      rawSoundKey = settings.maghrib.sound;    loop = settings.maghrib.loopEnabled;
      splash = settings.maghrib.splashEnabled; flash = settings.maghrib.flashEnabled;
      vibrate = settings.maghrib.vibrateEnabled; quotes = settings.maghrib.quotesEnabled;
      customSoundUri = settings.maghrib.customSoundUri ?? '';
      useJamaat = true;
      prayerName = 'MAGHRIB';
      beginsTime = '';
      jamaatTime = todayData?.maghrib ?? '20:24';
      break;
    case 'isha':
      rawSoundKey = settings.isha.sound;     loop = settings.isha.loopEnabled;
      splash = settings.isha.splashEnabled;  flash = settings.isha.flashEnabled;
      vibrate = settings.isha.vibrateEnabled; quotes = settings.isha.quotesEnabled;
      customSoundUri = settings.isha.customSoundUri ?? '';
      useJamaat = settings.isha.useJamaat ?? false;
      prayerName = 'ISHA';
      beginsTime = todayData?.isha[0] ?? '21:59';
      jamaatTime = todayData?.isha[1] ?? '22:15';
      break;
    case 'jummah':
    default:
      rawSoundKey = settings.jummah.sound;    loop = settings.jummah.loopEnabled;
      splash = settings.jummah.splashEnabled; flash = settings.jummah.flashEnabled;
      vibrate = settings.jummah.vibrateEnabled; quotes = settings.jummah.quotesEnabled;
      customSoundUri = settings.jummah.customSoundUri ?? '';
      useJamaat = settings.jummah.useJamaat ?? false;
      prayerName = 'JUMMAH';
      beginsTime = todayData?.dhuhr[0] ?? '13:05';
      jamaatTime = todayData?.dhuhr[1] ?? '13:15';
      break;
  }

  const soundKey = settings.muteSounds ? 'none' : rawSoundKey;

  const body =
    prayerKey === 'shuruq'  ? `Sunrise at ${beginsTime} — deadline to pray Fajr` :
    prayerKey === 'maghrib' ? `Sunset Jama'at at ${jamaatTime}` :
    useJamaat
      ? `Jama'at at ${jamaatTime}`
      : `Begins ${beginsTime} · Jama'at ${jamaatTime}`;

  if (Platform.OS === 'android' && EeisAlarm) {
    let testQuoteText = '';
    let testQuoteRef  = '';
    if (quotes) {
      const qdata = await fetchQuotes().catch(() => [] as QuotesData);
      const qt = getNextQuote(qdata);
      testQuoteText = qt.text;
      testQuoteRef  = qt.reference;
    }
    await EeisAlarm.scheduleAlarm(
      `test_${prayerKey}`,
      trigger.getTime(),
      soundKey,
      prayerName,
      body,
      loop,
      splash,
      flash,
      vibrate,
      quotes,
      testQuoteText,
      testQuoteRef,
      customSoundUri,
      beginsTime,
      jamaatTime,
      useJamaat,
    ).catch(e => console.warn('[EeisAlarm] test schedule failed:', e));
    return;
  }

  // iOS / fallback
  const hasSound = soundKey !== 'none';
  const iosSound = hasSound ? (NOTIFICATION_SOUND_FILE[soundKey] ?? true) : false;
  await Notifications.scheduleNotificationAsync({
    identifier: `test_${prayerKey}`,
    content: {
      title: `🧪 ${prayerName} Test`,
      body,
      ...(Platform.OS === 'ios' && { sound: iosSound, interruptionLevel: 'timeSensitive' }),
    } as any,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
}

// ─── Main scheduler ───────────────────────────────────────────────────────────
//
// Android path: uses native EeisAlarm module (AlarmManager → MediaPlayer with
//   USAGE_ALARM). This bypasses DND and plays on the alarm stream on locked screens.
//   expo-notifications is still used for the iOS path where it works correctly.
//
// iOS path: expo-notifications with interruptionLevel: 'timeSensitive'.

// Cancel all native AlarmManager alarms for the next 10 days by regenerating their IDs.
// Must be called before rescheduling so muteNotifications / muteSounds changes take effect.
async function cancelAllNativeAlarms(): Promise<void> {
  if (Platform.OS !== 'android' || !EeisAlarm) return;
  const now = new Date();
  const cancels: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dk = getDateKey(d);
    for (const p of ['fajr', 'shuruq', 'dhuhr', 'jummah1', 'jummah2', 'asr', 'maghrib', 'isha']) {
      cancels.push(EeisAlarm!.cancelAlarm(`${p}_${dk}`).catch(() => {}));
    }
  }
  await Promise.all(cancels);
}

export async function scheduleAllNotifications(settings: AlertSettings): Promise<void> {
  // Cancel everything first — including native AlarmManager alarms
  await cancelAllNativeAlarms();
  if (Platform.OS === 'android' && EeisAlarm) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  } else {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  if (settings.muteAll) return;

  // Pre-fetch quotes if any prayer has quotesEnabled (one fetch for the whole schedule run)
  const needsQuotes = ['fajr', 'shuruq', 'dhuhr', 'asr', 'maghrib', 'isha', 'jummah']
    .some(k => (settings as any)[k]?.quotesEnabled);
  let quotesData: QuotesData = [];
  if (needsQuotes) {
    quotesData = await fetchQuotes().catch(() => []);
  }

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

    /**
     * Schedule one prayer notification.
     * Android:  native AlarmManager via EeisAlarm module
     * iOS:      expo-notifications with timeSensitive interruption
     */
    const schedule = async (
      id: string,
      title: string,
      body: string,
      minutesSinceMidnight: number,
      soundKey: SoundKey,
      loopEnabled: boolean = false,
      splash:  boolean = false,
      flash:   boolean = false,
      vibrate: boolean = false,
      quotes:  boolean = false,
      customSoundUri: string = '',
      quoteText: string = '',
      quoteRef:  string = '',
      beginsTime: string = '',
      jamaatTime: string = '',
      useJamaat:  boolean = false,
    ) => {
      const trigger = new Date(date);
      trigger.setHours(
        Math.floor(minutesSinceMidnight / 60),
        minutesSinceMidnight % 60,
        0, 0,
      );
      if (trigger <= now) return;

      const alarmId = `${id}_${dateKey}`;
      // Respect master mute: if muteSounds is on, play nothing regardless of per-prayer sound
      const effectiveSoundKey: SoundKey = settings.muteSounds ? 'none' : soundKey;

      if (Platform.OS === 'android' && EeisAlarm) {
        // ── Android: native alarm ─────────────────────────────────────────
        // EeisAlarmService plays audio via MediaPlayer with USAGE_ALARM,
        // which bypasses DND and works on Samsung locked screens.
        // soundKey 'none' → soundName 'none' → service skips MediaPlayer (vibrate only)
        await EeisAlarm.scheduleAlarm(
          alarmId,
          trigger.getTime(),  // epoch ms
          effectiveSoundKey,  // res/raw/ file name without extension (or 'custom')
          title.replace(/[🌙☀️]/g, '').trim(), // clean prayer name (no emoji)
          body,
          loopEnabled,
          splash,
          flash,
          vibrate,
          quotes,
          quoteText,
          quoteRef,
          customSoundUri,     // file:// URI for user-imported sounds, '' otherwise
          beginsTime,
          jamaatTime,
          useJamaat,
        ).catch(e => console.warn(`[EeisAlarm] schedule failed for ${alarmId}:`, e));

      } else {
        // ── iOS (and Android fallback if native module unavailable) ────────
        const hasSound = effectiveSoundKey !== 'none';
        const iosSound = hasSound ? (NOTIFICATION_SOUND_FILE[effectiveSoundKey] ?? true) : false;

        await Notifications.scheduleNotificationAsync({
          identifier: alarmId,
          content: {
            title,
            body,
            data: { soundKey: effectiveSoundKey, loopEnabled },
            categoryIdentifier: hasSound ? 'PRAYER_ALERT' : undefined,
            ...(Platform.OS === 'android' && {
              android: { channelId: channelIdForSound(effectiveSoundKey) },
            }),
            ...(Platform.OS === 'ios' && {
              sound: iosSound,
              interruptionLevel: 'timeSensitive',
            }),
          } as any,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
        });
      }
    };

    // Helper: pick the next sequential quote when the prayer has quotesEnabled
    const q = (enabled: boolean) => {
      if (!enabled) return { t: '', r: '' };
      const qt = getNextQuote(quotesData);
      return { t: qt.text, r: qt.reference };
    };

    // FAJR
    if (!settings.muteNotifications && settings.fajr.notifyEnabled) {
      const fajrUseJamaat = (settings.fajr as any).useJamaat ?? false;
      const fajrOffset = settings.fajr.offsetMinutes ?? 0;
      const fajrTriggerM = fajrUseJamaat
        ? Math.max(timeToMinutes(prayerData.fajr[1]) - fajrOffset, 0)
        : timeToMinutes(prayerData.fajr[0]);
      const fajrBody = fajrUseJamaat
        ? `Jama'at at ${prayerData.fajr[1]} · in ${fajrOffset} min`
        : `Begins ${prayerData.fajr[0]} · Jama'at ${prayerData.fajr[1]}`;
      const { t, r } = q(settings.fajr.quotesEnabled);
      await schedule(
        'fajr', 'Fajr 🌙', fajrBody, fajrTriggerM,
        settings.fajr.sound as SoundKey,
        settings.fajr.loopEnabled,
        settings.fajr.splashEnabled,
        settings.fajr.flashEnabled,
        settings.fajr.vibrateEnabled,
        settings.fajr.quotesEnabled,
        settings.fajr.customSoundUri ?? '',
        t, r,
        prayerData.fajr[0], prayerData.fajr[1], fajrUseJamaat,
      );
    }

    // SHURUQ
    if (!settings.muteNotifications && settings.shuruq.notifyEnabled) {
      const shuruqM  = timeToMinutes(prayerData.shuruq);
      const triggerM = Math.max(shuruqM - settings.shuruq.offsetMinutes, 0);
      const label    = settings.shuruq.offsetMinutes > 0
        ? `Sunrise at ${prayerData.shuruq} · in ${settings.shuruq.offsetMinutes} min`
        : `Shuruq · Sunrise at ${prayerData.shuruq}`;
      const { t, r } = q(settings.shuruq.quotesEnabled);
      await schedule(
        'shuruq', 'Shuruq ☀️', label, triggerM,
        settings.shuruq.sound as SoundKey,
        settings.shuruq.loopEnabled,
        settings.shuruq.splashEnabled,
        settings.shuruq.flashEnabled,
        settings.shuruq.vibrateEnabled,
        settings.shuruq.quotesEnabled,
        settings.shuruq.customSoundUri ?? '',
        t, r,
        prayerData.shuruq, '', false,
      );
    }

    // DHUHR (non-Friday)
    if (!isFriday && !settings.muteNotifications && settings.dhuhr.notifyEnabled) {
      const dhuhrUseJamaat = (settings.dhuhr as any).useJamaat ?? false;
      const offset = settings.dhuhr.offsetMinutes ?? 0;
      const triggerM = dhuhrUseJamaat
        ? Math.max(timeToMinutes(prayerData.dhuhr[1]) - offset, 0)
        : timeToMinutes(prayerData.dhuhr[0]);
      const body = dhuhrUseJamaat
        ? `Jama'at at ${prayerData.dhuhr[1]} · in ${offset} min`
        : `Begins ${prayerData.dhuhr[0]} · Jama'at ${prayerData.dhuhr[1]}`;
      const { t, r } = q(settings.dhuhr.quotesEnabled);
      await schedule(
        'dhuhr', 'Dhuhr', body, triggerM,
        settings.dhuhr.sound as SoundKey,
        settings.dhuhr.loopEnabled,
        settings.dhuhr.splashEnabled,
        settings.dhuhr.flashEnabled,
        settings.dhuhr.vibrateEnabled,
        settings.dhuhr.quotesEnabled,
        settings.dhuhr.customSoundUri ?? '',
        t, r,
        prayerData.dhuhr[0], prayerData.dhuhr[1], dhuhrUseJamaat,
      );
    }

    // JUMMAH (Friday only)
    if (isFriday && !settings.muteNotifications && settings.jummah.notifyEnabled) {
      const j1 = bst ? '13:15' : '12:40';
      const j2 = bst ? '13:50' : '13:15';
      if (settings.jummah.jamaat1) {
        const triggerM = Math.max(timeToMinutes(j1) - settings.jummah.offsetMinutes, 0);
        const { t, r } = q(settings.jummah.quotesEnabled);
        await schedule(
          'jummah1', 'Jummah 1',
          `1st Jama'at at ${j1} · in ${settings.jummah.offsetMinutes} min`,
          triggerM,
          settings.jummah.sound as SoundKey,
          settings.jummah.loopEnabled,
          settings.jummah.splashEnabled,
          settings.jummah.flashEnabled,
          settings.jummah.vibrateEnabled,
          settings.jummah.quotesEnabled,
          '', t, r,
          '', j1, true,
        );
      }
      if (settings.jummah.jamaat2) {
        const triggerM = Math.max(timeToMinutes(j2) - settings.jummah.offsetMinutes, 0);
        const { t, r } = q(settings.jummah.quotesEnabled);
        await schedule(
          'jummah2', 'Jummah 2',
          `2nd Jama'at at ${j2} · in ${settings.jummah.offsetMinutes} min`,
          triggerM,
          settings.jummah.sound as SoundKey,
          settings.jummah.loopEnabled,
          settings.jummah.splashEnabled,
          settings.jummah.flashEnabled,
          settings.jummah.vibrateEnabled,
          settings.jummah.quotesEnabled,
          '', t, r,
          '', j2, true,
        );
      }
    }

    // ASR
    if (!settings.muteNotifications && settings.asr.notifyEnabled) {
      const asrUseJamaat = (settings.asr as any).useJamaat ?? false;
      const offset = settings.asr.offsetMinutes ?? 0;
      const triggerM = asrUseJamaat
        ? Math.max(timeToMinutes(prayerData.asr[1]) - offset, 0)
        : timeToMinutes(prayerData.asr[0]);
      const body = asrUseJamaat
        ? `Jama'at at ${prayerData.asr[1]} · in ${offset} min`
        : `Begins ${prayerData.asr[0]} · Jama'at ${prayerData.asr[1]}`;
      const { t, r } = q(settings.asr.quotesEnabled);
      await schedule(
        'asr', 'Asr', body, triggerM,
        settings.asr.sound as SoundKey,
        settings.asr.loopEnabled,
        settings.asr.splashEnabled,
        settings.asr.flashEnabled,
        settings.asr.vibrateEnabled,
        settings.asr.quotesEnabled,
        settings.asr.customSoundUri ?? '',
        t, r,
        prayerData.asr[0], prayerData.asr[1], asrUseJamaat,
      );
    }

    // MAGHRIB
    if (!settings.muteNotifications && settings.maghrib.notifyEnabled) {
      const maghribM = timeToMinutes(prayerData.maghrib);
      const triggerM = Math.max(maghribM - settings.maghrib.offsetMinutes, 0);
      const label    = settings.maghrib.offsetMinutes > 0
        ? `Maghrib at ${prayerData.maghrib} · in ${settings.maghrib.offsetMinutes} min`
        : `Maghrib · Jama'at ${prayerData.maghrib}`;
      const { t, r } = q(settings.maghrib.quotesEnabled);
      await schedule(
        'maghrib', 'Maghrib', label, triggerM,
        settings.maghrib.sound as SoundKey,
        settings.maghrib.loopEnabled,
        settings.maghrib.splashEnabled,
        settings.maghrib.flashEnabled,
        settings.maghrib.vibrateEnabled,
        settings.maghrib.quotesEnabled,
        settings.maghrib.customSoundUri ?? '',
        t, r,
        '', prayerData.maghrib, true,
      );
    }

    // ISHA
    if (!settings.muteNotifications && settings.isha.notifyEnabled) {
      const ishaUseJamaat = (settings.isha as any).useJamaat ?? false;
      const offset = settings.isha.offsetMinutes ?? 0;
      const triggerM = ishaUseJamaat
        ? Math.max(timeToMinutes(prayerData.isha[1]) - offset, 0)
        : timeToMinutes(prayerData.isha[0]);
      const body = ishaUseJamaat
        ? `Jama'at at ${prayerData.isha[1]} · in ${offset} min`
        : `Begins ${prayerData.isha[0]} · Jama'at ${prayerData.isha[1]}`;
      const { t, r } = q(settings.isha.quotesEnabled);
      await schedule(
        'isha', 'Isha', body, triggerM,
        settings.isha.sound as SoundKey,
        settings.isha.loopEnabled,
        settings.isha.splashEnabled,
        settings.isha.flashEnabled,
        settings.isha.vibrateEnabled,
        settings.isha.quotesEnabled,
        settings.isha.customSoundUri ?? '',
        t, r,
        prayerData.isha[0], prayerData.isha[1], ishaUseJamaat,
      );
    }
  }
}

// ─── Alarm playback controls (called from app UI) ────────────────────────────
export async function stopCurrentAlarm(): Promise<void> {
  if (Platform.OS === 'android' && EeisAlarm) {
    await EeisAlarm.stopCurrentAlarm().catch(() => {});
  }
}

export async function pauseCurrentAlarm(): Promise<void> {
  if (Platform.OS === 'android' && EeisAlarm) {
    await EeisAlarm.pauseAlarm().catch(() => {});
  }
}

export async function resumeCurrentAlarm(): Promise<void> {
  if (Platform.OS === 'android' && EeisAlarm) {
    await EeisAlarm.resumeAlarm().catch(() => {});
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
