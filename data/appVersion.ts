import Constants from 'expo-constants';
import { Platform, Linking, Alert } from 'react-native';

// ─── Remote version manifest (Android only) ────────────────────────────────────
// This file is hosted at the URL below and manually bumped by the developer each time a new
// build is published to the Play Store. Format: { "android": <versionCode> }
// iOS no longer uses this file — see the live Apple lookup below, which can never go stale.
const VERSION_CHECK_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/latest-version.json';

// Apple's own public App Store lookup API — always reflects whatever is ACTUALLY live right now,
// so there is no manifest file to remember to bump and this class of bug (v130: a forgotten,
// stale manifest caused false "Update Available" prompts) cannot recur for iOS. `country=gb` is
// required — the default (US) storefront doesn't have this app and returns an empty result.
const IOS_LOOKUP_URL =
  'https://itunes.apple.com/lookup?bundleId=com.eeis.prayertimes&country=gb';

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.eeis.prayertimes';

const APP_STORE_URL = 'https://apps.apple.com/gb/app/eeis-prayer-times/id6781048296';

// ─── Version comparison ────────────────────────────────────────────────────────

/** True only when `latest` is a strictly HIGHER major.minor.patch than `current` — never true for
 *  an equal, older, or malformed manifest value. This is what makes the check direction-aware:
 *  the previous `!==` comparison flagged ANY mismatch, including the installed app being newer
 *  than a stale manifest (exactly what caused false "Update Available" prompts on iOS). */
function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map(n => Number(n) || 0);
  const b = current.split('.').map(n => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Check for a newer app version and show an Alert prompt if one exists. A light courtesy nudge
 * only — most users get silent background updates from the store itself regardless of this.
 * Fails silently on network errors so it never blocks the app.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const res = await fetch(VERSION_CHECK_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const json = await res.json();
      const currentCode = (Constants.expoConfig?.android?.versionCode as number | undefined) ?? 0;
      const latestCode  = Number(json.android ?? 0);
      if (latestCode > currentCode) {
        Alert.alert(
          'Update Available',
          'A new version of EEIS Prayer Times is available on the Play Store.',
          [
            {
              text: 'Update Now',
              onPress: () => Linking.openURL(PLAY_STORE_URL).catch(() => {}),
            },
            { text: 'Later', style: 'cancel' },
          ],
        );
      }
    } else if (Platform.OS === 'ios') {
      const res = await fetch(IOS_LOOKUP_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const json = await res.json();
      const currentVer = Constants.expoConfig?.version ?? '0.0.0';
      const latestVer  = String(json.results?.[0]?.version ?? currentVer);
      if (isNewerVersion(latestVer, currentVer)) {
        Alert.alert(
          'Update Available',
          'A new version of EEIS Prayer Times is available on the App Store.',
          [
            {
              text: 'Update Now',
              onPress: () => Linking.openURL(APP_STORE_URL).catch(() => {}),
            },
            { text: 'Later', style: 'cancel' },
          ],
        );
      }
    }
  } catch {
    // Network / parse error — fail silently, never block the user
  }
}
