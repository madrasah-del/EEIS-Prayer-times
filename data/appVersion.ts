import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// ─── Grace period ───────────────────────────────────────────────────────────
// Both stores silently auto-update installed apps in the background for most users by default,
// but that delivery isn't instant — it can take a while after a release goes live before every
// device with auto-update ON has actually received it. Showing "Update Available" during that
// window would nag someone whose update is simply still on its way. Waiting long enough that
// virtually everyone with auto-update ON has already received it silently means this prompt only
// ever reaches the group it's actually for: people who've turned auto-update off (there's no API
// on either platform to detect that directly — see data/appVersion.ts history — so this is the
// only available way to target them without also catching people mid-rollout).
const UPDATE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Fails closed: returns false (never show) if the release date is missing/unparseable, so a
 *  manifest that hasn't been updated with this field yet never accidentally shows the prompt. */
function isPastGracePeriod(releaseDateIso: string | undefined): boolean {
  if (!releaseDateIso) return false;
  const releasedAt = Date.parse(releaseDateIso);
  if (Number.isNaN(releasedAt)) return false;
  return Date.now() - releasedAt >= UPDATE_GRACE_PERIOD_MS;
}

// ─── Weekly repeat cap ──────────────────────────────────────────────────────
// Once someone is genuinely behind and starts seeing this prompt, don't show it again on every
// single app open — that's exactly the "bombarding" the user was worried about elsewhere in this
// app (permission reminders, the notification-tap nudge both cap at once a month). Cap this one
// at once a week: firm enough to eventually be seen, not so often it feels like nagging.
const UPDATE_PROMPT_REPEAT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LAST_SHOWN_KEY = '@eeis_update_prompt_last_shown';

async function canShowPromptNow(): Promise<boolean> {
  const lastShownRaw = await AsyncStorage.getItem(LAST_SHOWN_KEY).catch(() => null);
  if (!lastShownRaw) return true;
  const lastShown = Number(lastShownRaw);
  if (Number.isNaN(lastShown)) return true;
  return Date.now() - lastShown >= UPDATE_PROMPT_REPEAT_MS;
}

async function markPromptShown(): Promise<void> {
  await AsyncStorage.setItem(LAST_SHOWN_KEY, String(Date.now())).catch(() => {});
}

// ─── Message building ───────────────────────────────────────────────────────

/** Builds the alert body, appending the store's own "What's New" text when available so the
 *  prompt says WHAT is being fixed/improved, not just that something changed. */
function buildMessage(storeLabel: string, releaseNotes: string | undefined): string {
  const base = `A new version of EEIS Prayer Times is available on the ${storeLabel}.`;
  const notes = releaseNotes?.trim();
  return notes ? `${base}\n\nWhat's new:\n${notes}` : base;
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
      if (
        latestCode > currentCode &&
        isPastGracePeriod(json.androidReleaseDate) &&
        (await canShowPromptNow())
      ) {
        Alert.alert(
          'Update Available',
          buildMessage('Play Store', json.androidReleaseNotes as string | undefined),
          [
            {
              text: 'Update Now',
              onPress: () => Linking.openURL(PLAY_STORE_URL).catch(() => {}),
            },
            { text: 'Later', style: 'cancel' },
          ],
        );
        await markPromptShown();
      }
    } else if (Platform.OS === 'ios') {
      const res = await fetch(IOS_LOOKUP_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const json = await res.json();
      const currentVer = Constants.expoConfig?.version ?? '0.0.0';
      const latestVer  = String(json.results?.[0]?.version ?? currentVer);
      const releaseDate = json.results?.[0]?.currentVersionReleaseDate as string | undefined;
      if (
        isNewerVersion(latestVer, currentVer) &&
        isPastGracePeriod(releaseDate) &&
        (await canShowPromptNow())
      ) {
        Alert.alert(
          'Update Available',
          buildMessage('App Store', json.results?.[0]?.releaseNotes as string | undefined),
          [
            {
              text: 'Update Now',
              onPress: () => Linking.openURL(APP_STORE_URL).catch(() => {}),
            },
            { text: 'Later', style: 'cancel' },
          ],
        );
        await markPromptShown();
      }
    }
  } catch {
    // Network / parse error — fail silently, never block the user
  }
}
