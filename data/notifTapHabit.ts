/**
 * notifTapHabit — iOS-only. Tracks whether the user is in the habit of TAPPING prayer
 * notifications (the fastest way to reach the full prayer pop-up on iPhone, since Apple doesn't
 * allow a locked screen to self-open into the app). If a user has gone a month without tapping
 * one (they may only ever be opening the app icon, which still works via the catch-up path but
 * more slowly), show a single gentle tip — at most once per calendar month, same shape as the
 * existing permission reminder in `permissionState.ts`.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_TAP_KEY      = '@eeis_last_notif_tap';
const REMINDER_MONTH_KEY = '@eeis_notiftap_reminder_month';
const WINDOW_DAYS = 30;

/** Call from the real (non-test) notification-tap handler on iOS. */
export async function recordNotifTap(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await AsyncStorage.setItem(LAST_TAP_KEY, new Date().toISOString()).catch(() => {});
}

/**
 * Returns true (and marks this month as shown) when the user hasn't tapped a real prayer
 * notification in the last WINDOW_DAYS days, and hasn't already been shown the tip this calendar
 * month. Returns false otherwise (Android, tapped recently, or already shown this month).
 */
export async function maybeMonthlyNotifTapReminder(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

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
