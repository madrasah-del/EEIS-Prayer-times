import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundKey } from '../data/soundOptions';

export type { SoundKey };

export type PrayerAlert = {
  notifyEnabled: boolean;
  sound: SoundKey;
  loopEnabled?: boolean; // only used by Fajr and Shuruq
};

export type OffsetAlert = {
  notifyEnabled: boolean;
  sound: SoundKey;
  offsetMinutes: number;
  loopEnabled?: boolean; // Fajr and Shuruq only — loop sound until stopped
};

export type JummahAlert = {
  jamaat1: boolean;
  jamaat2: boolean;
  notifyEnabled: boolean;
  sound: SoundKey;
  offsetMinutes: number; // 0–120 min before chosen jamaat time
};

export type AlertSettings = {
  fajr:    PrayerAlert;
  shuruq:  OffsetAlert;  // 0–90 min before sunrise
  dhuhr:   PrayerAlert;
  asr:     PrayerAlert;
  maghrib: OffsetAlert;  // 0–60 min before Maghrib
  isha:    PrayerAlert;
  jummah:  JummahAlert;
  masterVolume:      number;  // 0–1
  muteNotifications: boolean;
  muteSounds:        boolean;
  muteAll:           boolean; // front-screen master mute
};

const DEFAULT: AlertSettings = {
  fajr:    { notifyEnabled: false, sound: 'none', loopEnabled: false },
  shuruq:  { notifyEnabled: false, sound: 'none', offsetMinutes: 15, loopEnabled: false },
  dhuhr:   { notifyEnabled: false, sound: 'none' },
  asr:     { notifyEnabled: false, sound: 'none' },
  maghrib: { notifyEnabled: false, sound: 'none', offsetMinutes: 0 },
  isha:    { notifyEnabled: false, sound: 'none' },
  jummah:  { jamaat1: true, jamaat2: false, notifyEnabled: false, sound: 'none', offsetMinutes: 30 },
  masterVolume:      0.8,
  muteNotifications: false,
  muteSounds:        false,
  muteAll:           false,
};

const STORAGE_KEY = '@eeis_alert_settings_v1';

export function useAlertSettings() {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Deep merge to handle new keys added in future versions
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
