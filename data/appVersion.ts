import Constants from 'expo-constants';
import { Platform, Linking, Alert } from 'react-native';

// ─── Remote version manifest ───────────────────────────────────────────────────
// This file is hosted at the URL below and manually bumped by the developer each
// time a new build is published to the Play Store / App Store.
// Format: { "android": <versionCode>, "ios": "<version string>" }
const VERSION_CHECK_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/latest-version.json';

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.eeis.prayertimes';

// Placeholder — fill in the real App Store URL when the iOS app is published.
const APP_STORE_URL = 'https://apps.apple.com/gb/app/eeis-prayer-times/id0000000000';

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Check GitHub for a newer app version and show an Alert prompt if one exists.
 * Fails silently on network errors so it never blocks the app.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(VERSION_CHECK_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    const json = await res.json();

    if (Platform.OS === 'android') {
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
      const currentVer = Constants.expoConfig?.version ?? '0.0.0';
      const latestVer  = String(json.ios ?? '0.0.0');
      if (latestVer !== currentVer) {
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
