import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundKey } from '../data/soundOptions';

export type { SoundKey };

// Per-prayer effect flags (v18) — all default false (user opts in)
type EffectFlags = {
  splashEnabled:  boolean; // lock screen 3× white flash then content reveal
  flashEnabled:   boolean; // rear torch LED flash
  vibrateEnabled: boolean; // vibration
  loopEnabled:    boolean; // loop sound until stopped
  quotesEnabled:  boolean; // show Quran quote on splash or in notification body
};

export type PrayerAlert = EffectFlags & {
  notifyEnabled:   boolean;
  sound:           SoundKey;
  useJamaat?:      boolean;  // false/undefined = fire at begins time; true = fire at jamaat - offsetMinutes
  offsetMinutes:   number;
  customSoundUri?:  string;
  customSoundName?: string;
};

export type OffsetAlert = EffectFlags & {
  notifyEnabled:   boolean;
  sound:           SoundKey;
  offsetMinutes:   number;
  customSoundUri?:  string;
  customSoundName?: string;
};

export type JummahAlert = EffectFlags & {
  jamaat1:         boolean;
  jamaat2:         boolean;
  notifyEnabled:   boolean;
  sound:           SoundKey;
  useJamaat?:      boolean;
  offsetMinutes:   number;
  customSoundUri?:  string;
  customSoundName?: string;
};

// Kept for migration from v17 global alarmMode
export type AlarmMode =
  | 'sound-only'
  | 'sound-screen'
  | 'sound-torch'
  | 'sound-vibrate'
  | 'sound-vibrate-screen'
  | 'sound-vibrate-torch';

export function migrateAlarmMode(mode: string): AlarmMode {
  switch (mode) {
    case 'all':          return 'sound-vibrate-screen';
    case 'sound-flash':  return 'sound-screen';
    case 'sound-vibrate': return 'sound-vibrate';
    case 'sound-only':   return 'sound-only';
    default: return mode as AlarmMode;
  }
}

function alarmModeToEffects(mode: AlarmMode): Pick<EffectFlags, 'splashEnabled' | 'flashEnabled' | 'vibrateEnabled'> {
  const splash  = mode.includes('screen') || mode.includes('torch');
  const flash   = mode.includes('torch');
  const vibrate = mode.includes('vibrate');
  return { splashEnabled: splash, flashEnabled: flash, vibrateEnabled: vibrate };
}

export type AlertSettings = {
  fajr:    PrayerAlert;
  shuruq:  OffsetAlert;
  dhuhr:   PrayerAlert;
  asr:     PrayerAlert;
  maghrib: OffsetAlert;
  isha:    PrayerAlert;
  jummah:  JummahAlert;
  masterVolume:      number;
  fontScale:         number;
  muteNotifications: boolean;
  muteSounds:        boolean;
  muteAll:           boolean;
  countdownMode:     'adhan' | 'iqamah';
  tasbihVisible:     boolean;
};

const NO_EFFECTS: EffectFlags = {
  splashEnabled: false, flashEnabled: false, vibrateEnabled: false,
  loopEnabled: false, quotesEnabled: false,
};

const DEFAULT: AlertSettings = {
  fajr:    { notifyEnabled: false, sound: 'none', useJamaat: false, offsetMinutes: 0,  ...NO_EFFECTS },
  shuruq:  { notifyEnabled: true,  sound: 'none', offsetMinutes: 45, ...NO_EFFECTS },
  dhuhr:   { notifyEnabled: true,  sound: 'none', useJamaat: false, offsetMinutes: 45, ...NO_EFFECTS },
  asr:     { notifyEnabled: true,  sound: 'none', useJamaat: false, offsetMinutes: 45, ...NO_EFFECTS },
  maghrib: { notifyEnabled: true,  sound: 'none', offsetMinutes: 0,  ...NO_EFFECTS },
  isha:    { notifyEnabled: true,  sound: 'none', useJamaat: false, offsetMinutes: 45, ...NO_EFFECTS },
  jummah:  { jamaat1: true, jamaat2: false, notifyEnabled: true, sound: 'none', useJamaat: true, offsetMinutes: 45, ...NO_EFFECTS },
  masterVolume:      0.8,
  fontScale:         1.4,
  muteNotifications: false,
  muteSounds:        false,
  muteAll:           false,
  countdownMode:     'adhan',
  tasbihVisible:     true,
};

// v4: bumped from v3 — resets all existing installs to new defaults above
const STORAGE_KEY = '@eeis_alert_settings_v4';

const PRAYER_KEYS = ['fajr', 'shuruq', 'dhuhr', 'asr', 'maghrib', 'isha', 'jummah'] as const;

export function useAlertSettings() {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);

          // Migrate v17 global alarmMode → per-prayer effect flags
          if (parsed.alarmMode) {
            const effects = alarmModeToEffects(migrateAlarmMode(parsed.alarmMode));
            for (const key of PRAYER_KEYS) {
              if (parsed[key] && parsed[key].splashEnabled === undefined) {
                parsed[key] = { ...parsed[key], ...effects };
              }
            }
            delete parsed.alarmMode;
          }

          // Migrate missing fields from older storage versions
          const offsetDefaults: Record<string, number> = {
            fajr: 0, shuruq: 45, dhuhr: 45, asr: 45, maghrib: 0, isha: 45, jummah: 45,
          };
          for (const key of PRAYER_KEYS) {
            if (parsed[key]) {
              if (parsed[key].loopEnabled === undefined)    parsed[key].loopEnabled    = false;
              if (parsed[key].splashEnabled === undefined)  parsed[key].splashEnabled  = false;
              if (parsed[key].flashEnabled === undefined)   parsed[key].flashEnabled   = false;
              if (parsed[key].vibrateEnabled === undefined) parsed[key].vibrateEnabled = false;
              if (parsed[key].quotesEnabled === undefined)  parsed[key].quotesEnabled  = false;
              if (parsed[key].offsetMinutes === undefined)  parsed[key].offsetMinutes  = offsetDefaults[key] ?? 0;
              if (parsed[key].useJamaat === undefined)      parsed[key].useJamaat      = false;
            }
          }

          // Migrate missing top-level fields
          if (parsed.countdownMode === undefined) parsed.countdownMode = 'adhan';
          if (parsed.tasbihVisible === undefined) parsed.tasbihVisible = true;

          setSettings(prev => ({
            ...prev,
            ...parsed,
            fajr:    { ...prev.fajr,    ...parsed.fajr },
            shuruq:  { ...prev.shuruq,  ...parsed.shuruq },
            dhuhr:   { ...prev.dhuhr,   ...parsed.dhuhr },
            asr:     { ...prev.asr,     ...parsed.asr },
            maghrib: { ...prev.maghrib, ...parsed.maghrib },
            isha:    { ...prev.isha,    ...parsed.isha },
            jummah:  { ...prev.jummah,  ...parsed.jummah },
          }));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: AlertSettings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const update = useCallback((patch: Partial<AlertSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, [persist]);

  const updatePrayer = useCallback(<K extends keyof AlertSettings>(
    key: K,
    patch: Partial<AlertSettings[K]>
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: { ...(prev[key] as object), ...patch } };
      persist(next);
      return next;
    });
  }, [persist]);

  return { settings, update, updatePrayer, loaded };
}
