import { Dimensions } from 'react-native';

const { height: H, width: W } = Dimensions.get('window');

// Scale fonts relative to an ~800dp-tall reference phone (typical 6" compact).
// A taller/larger physical screen gets proportionally larger fonts.
// Clamped to [0.9, 1.25] to prevent extreme values on very small or very large screens.
const rawScale = H / 800;
export const screenScale = Math.min(1.25, Math.max(0.9, rawScale));

/** Return a font/dimension size scaled to the current screen height */
export function sp(size: number): number {
  return Math.round(size * screenScale);
}

// Maximum safe user font-scale for PrayerRow so "HH:MM" never wraps.
// Derivation:
//   row budget = W - 32 (prayerList pad 8×2 + row pad 8×2)
//   nameCol base = sp(75); time text "HH:MM" ≈ 3.3 × sp(19) × fontScale wide
//   worst case: "changed" badge adds 12dp padding to the jamaat timeCol
//   Solving (W - 56) / 2 ≥ screenScale × fontScale × (37.5 + 62.7) for fontScale:
export const maxFontScale = Math.min(
  1.4,
  Math.max(1.0, (W - 56) / (2 * screenScale * 100.2))
);
