// Sound options are split into two groups:
// - FAJR_SHURUQ_SOUNDS: exclusive to Fajr and Shuruq (longer, loopable content)
// - STANDARD_SOUNDS: used by all other prayer rows and Jummah

export type FajrShuruqSoundKey =
  | 'none'
  | 'fajr_adhan_dua'
  | 'awaken_dua'
  | 'ayatul_kursi'
  | 'gentle_waves'
  | 'ocean_waves'
  | 'forest_birds';

export type StandardSoundKey =
  | 'none'
  | 'adhan'
  | 'notify_1'
  | 'notify_2'
  | 'notify_3'
  | 'notify_4'
  | 'notify_5'
  | 'notify_6';

export type SoundKey = FajrShuruqSoundKey | StandardSoundKey | 'custom';

export type SoundDef = {
  key: SoundKey;
  label: string;
  file: any; // require() asset — null means no file yet
};

export const FAJR_SHURUQ_SOUNDS: SoundDef[] = [
  { key: 'none',           label: 'No Sound',                            file: null },
  { key: 'fajr_adhan_dua', label: 'Fajr Adhan & Dua',                   file: require('../assets/sounds/fajr_shuruq/fajr_adhan_dua.mp3') },
  { key: 'awaken_dua',     label: 'Awaken Dua',                         file: require('../assets/sounds/fajr_shuruq/awaken_dua.mp3') },
  { key: 'ayatul_kursi',   label: 'Ayatul-Kursi Full Beautiful Recitation', file: require('../assets/sounds/fajr_shuruq/ayatul_kursi.mp3') },
  { key: 'gentle_waves',   label: 'Gentle Waves',                       file: require('../assets/sounds/fajr_shuruq/gentle_waves.mp3') },
  { key: 'ocean_waves',    label: 'Ocean Waves',                        file: require('../assets/sounds/fajr_shuruq/ocean_waves.mp3') },
  { key: 'forest_birds',   label: 'Forest Birds',                       file: require('../assets/sounds/fajr_shuruq/forest_birds.mp3') },
];

export const STANDARD_SOUNDS: SoundDef[] = [
  { key: 'none',     label: 'No Sound', file: null },
  { key: 'adhan',    label: 'Adhan',    file: require('../assets/sounds/std/adhan.mp3') },
  { key: 'notify_1', label: 'Notify 1', file: require('../assets/sounds/std/notify_1.mp3') },
  { key: 'notify_2', label: 'Notify 2', file: require('../assets/sounds/std/notify_2.mp3') },
  { key: 'notify_3', label: 'Notify 3', file: require('../assets/sounds/std/notify_3.mp3') },
  { key: 'notify_4', label: 'Notify 4', file: require('../assets/sounds/std/notify_4.mp3') },
  { key: 'notify_5', label: 'Notify 5', file: require('../assets/sounds/std/notify_5.mp3') },
  { key: 'notify_6', label: 'Notify 6', file: require('../assets/sounds/std/notify_6.mp3') },
];

// Lookup helpers
export function getSoundDef(key: SoundKey): SoundDef | undefined {
  return (
    FAJR_SHURUQ_SOUNDS.find(s => s.key === key) ??
    STANDARD_SOUNDS.find(s => s.key === key)
  );
}

// Maps SoundKey → bundled filename for native notification delivery
// (plays on locked screen / background via Android/iOS notification system)
export const NOTIFICATION_SOUND_FILE: Partial<Record<SoundKey, string>> = {
  fajr_adhan_dua: 'fajr_adhan_dua.mp3',
  awaken_dua:     'awaken_dua.mp3',
  ayatul_kursi:   'ayatul_kursi.mp3',
  gentle_waves:   'gentle_waves.mp3',
  ocean_waves:    'ocean_waves.mp3',
  forest_birds:   'forest_birds.mp3',
  adhan:          'adhan.mp3',
  notify_1:       'notify_1.mp3',
  notify_2:       'notify_2.mp3',
  notify_3:       'notify_3.mp3',
  notify_4:       'notify_4.mp3',
  notify_5:       'notify_5.mp3',
  notify_6:       'notify_6.mp3',
};
