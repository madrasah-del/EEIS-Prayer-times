/**
 * notifTapHabit — iOS-only. Tracks whether the user is in the habit of TAPPING prayer
 * notifications (the fastest way to reach the full prayer pop-up on iPhone, since Apple doesn't
 * allow a locked screen to self-open into the app). If a user has gone a month without tapping
 * one, show a single gentle tip — at most once per calendar month, same shape as the existing
 * permission reminder in `permissionState.ts`.
 *
 * A brand-new install gets a 14-day grace period before it's ever judged: "no tap recorded" is
 * indistinguishable from "hasn't had a real prayer notification to tap yet" until the app has
 * genuinely had time to fire some — without this, the nudge fired on day-one installs, which is
 * exactly the bug that got this feature removed once already.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_TAP_KEY       = '@eeis_last_notif_tap';
const REMINDER_MONTH_KEY = '@eeis_notiftap_reminder_month';
const FIRST_LAUNCH_KEY   = '@eeis_first_launch_date';
const WINDOW_DAYS = 30;
const GRACE_DAYS  = 14;

/** Call once on every app mount — stamps the very first launch date, no-op on later launches. */
export async function stampFirstLaunchIfNeeded(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
    if (!existing) await AsyncStorage.setItem(FIRST_LAUNCH_KEY, new Date().toISOString());
  } catch {}
}

/** Call from the real (non-test) notification-tap handler on iOS. */
export async function recordNotifTap(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await AsyncStorage.setItem(LAST_TAP_KEY, new Date().toISOString()).catch(() => {});
}

/**
 * Returns true (and marks this month as shown) when: the install is at least GRACE_DAYS old,
 * the user hasn't tapped a real prayer notification in the last WINDOW_DAYS days, and hasn't
 * already been shown the tip this calendar month. Returns false otherwise.
 */
export async function maybeMonthlyNotifTapReminder(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  const firstLaunch = await AsyncStorage.getItem(FIRST_LAUNCH_KEY).catch(() => null);
  const installAgeOk = !!firstLaunch &&
    (Date.now() - new Date(firstLaunch).getTime()) >= GRACE_DAYS * 24 * 60 * 60 * 1000;
  if (!installAgeOk) return false;

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const lastShown = await AsyncStorage.getItem(REMINDER_MONTH_KEY).catch(() => null);
  if (lastShown === month) return false;

  const lastTap = await AsyncStorage.getItem(LAST_TAP_KEY).catch(() => null);
  const recentlyTapped = !!lastTap &&
    (Date.now() - new Date(lastTap).getTime()) < WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (recentlyTapped) return false;

  await AsyncStorage.setItem(REMINDER_MONTH_KEY, month).catch(() => {});
  return true;
}
