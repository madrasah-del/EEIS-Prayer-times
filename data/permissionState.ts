/**
 * permissionState — per-permission tracking so the first-launch wizard never nags.
 *
 * The old model used a single "wizard done" flag plus a live notification check, which meant:
 *   • a user who DECLINED notifications was re-asked on every single app open, and
 *   • if any wizard step was skipped, the "done" flag never set, so the whole wizard re-appeared
 *     on every open forever.
 *
 * This module records, PER permission, whether the user has already been ASKED (shown the wizard
 * step, whether they granted or skipped) and whether they've opted out of the monthly reminder.
 * The wizard now shows only for permissions that are not granted AND not yet asked; once a user
 * has been through a step, it never auto-re-appears. Users can always revisit permissions later
 * from the "App Permissions" section in Alerts (getPermissionsForManage) or via the monthly
 * reminder.
 */
import { Platform, NativeModules, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PermKey = 'notifications' | 'exactAlarm' | 'batteryOpt' | 'fullScreenIntent';

type PermRec = { asked?: boolean; dontRemind?: boolean };
type PermState = Partial<Record<PermKey, PermRec>>;

const STATE_KEY          = '@eeis_perm_state_v1';
const LEGACY_DONE_KEY    = '@eeis_perms_wizard_done_v2';
const REMINDER_MONTH_KEY = '@eeis_perm_reminder_month';
const PKG                = 'package:com.eeis.prayertimes';

function androidVersion(): number {
  return Platform.OS === 'android' ? (Platform.Version as number) : 0;
}

export type PermMeta = {
  key: PermKey;
  label: string;
  blurb: string;
  hint: string; // "where to tap next" once the OS settings screen opens
  relevant: () => boolean;
  /** true = granted, false = definitely not granted, null = cannot determine from JS. */
  checkGranted: () => Promise<boolean | null>;
  /** Action for the "Manage Permissions" UI / reminder (revisit path). `granted` is the current
   *  live status, so an already-granted permission can open a screen where it can be turned OFF. */
  open: (granted?: boolean | null) => Promise<void>;
};

export const PERMISSIONS: PermMeta[] = [
  {
    key: 'notifications',
    label: 'Notifications',
    blurb: 'Show prayer time alerts and the adhan reminder.',
    hint: 'Opens phone Settings → tap Notifications → turn the switch on or off.',
    relevant: () => true, // both platforms
    checkGranted: async () => {
      try { return (await Notifications.getPermissionsAsync()).status === 'granted'; } catch { return null; }
    },
    open: async () => {
      // Revisit path: send the user to the OS settings for this app so they can toggle it on.
      try { await Linking.openSettings(); } catch {}
    },
  },
  {
    key: 'exactAlarm',
    label: 'Precise alarms',
    blurb: 'Fire alarms at the exact prayer time (Android 12).',
    hint: 'Opens phone Settings → tap Alarms & reminders → turn the switch on.',
    relevant: () => androidVersion() === 31 || androidVersion() === 32,
    checkGranted: async () => null, // no reliable JS check
    open: async () => {
      try { await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', {}); } catch {}
    },
  },
  {
    key: 'batteryOpt',
    label: 'Background activity',
    blurb: 'Stop the phone killing alarms to save battery.',
    hint: 'Opens phone Settings → tap Battery → choose Unrestricted (on) or Optimised (off).',
    relevant: () => Platform.OS === 'android',
    checkGranted: async () => {
      try {
        const EeisAlarm = (NativeModules as any).EeisAlarm;
        if (EeisAlarm?.isIgnoringBatteryOptimizations) {
          const r = await EeisAlarm.isIgnoringBatteryOptimizations();
          return r === null || r === undefined ? null : !!r;
        }
      } catch {}
      return null;
    },
    open: async (granted) => {
      // Already exempt → the "request exemption" intent is a no-op (nothing to grant), so send the
      // user to the app's settings page where they can switch Battery back to Optimised (turn OFF).
      if (granted) {
        try { await Linking.openSettings(); } catch {}
        return;
      }
      // Not yet exempt → one-tap request dialog; fall back to app settings if the OEM refuses it.
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          { data: PKG },
        );
      } catch {
        try { await Linking.openSettings(); } catch {}
      }
    },
  },
  {
    key: 'fullScreenIntent',
    label: 'Full-screen alarm',
    blurb: 'Show the prayer screen over your lock screen (Android 14+).',
    hint: 'Opens the lock-screen alarm setting → turn the switch on or off.',
    relevant: () => androidVersion() >= 34,
    checkGranted: async () => {
      try {
        const EeisAlarm = (NativeModules as any).EeisAlarm;
        if (EeisAlarm?.checkFullScreenIntentPermission) {
          return !!(await EeisAlarm.checkFullScreenIntentPermission());
        }
      } catch {}
      return null;
    },
    open: async () => {
      try { await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT', { data: PKG }); } catch {}
    },
  },
];

function metaFor(key: PermKey): PermMeta | undefined {
  return PERMISSIONS.find(p => p.key === key);
}

// ─── State read/write ─────────────────────────────────────────────────────────

export async function getPermState(): Promise<PermState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as PermState;
    // Migrate old installs that completed the previous wizard → treat every step as already asked
    // so this fix never re-shows the wizard to someone who already finished it.
    const legacy = await AsyncStorage.getItem(LEGACY_DONE_KEY);
    if (legacy === 'true') {
      const migrated: PermState = {
        notifications: { asked: true }, exactAlarm: { asked: true },
        batteryOpt: { asked: true }, fullScreenIntent: { asked: true },
      };
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(migrated)).catch(() => {});
      return migrated;
    }
    return {};
  } catch { return {}; }
}

async function writeState(s: PermState): Promise<void> {
  try { await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

/** Mark a permission as "asked" (user was shown its wizard step, granted or skipped). */
export async function markPermAsked(key: PermKey): Promise<void> {
  const s = await getPermState();
  s[key] = { ...s[key], asked: true };
  await writeState(s);
}

/** Opt these permissions out of the monthly reminder. */
export async function setDontRemind(keys: PermKey[]): Promise<void> {
  const s = await getPermState();
  for (const k of keys) s[k] = { ...s[k], dontRemind: true };
  await writeState(s);
}

// ─── Wizard gating ──────────────────────────────────────────────────────────

/** Show the first-launch wizard only for a permission that is not granted AND not yet asked. */
export async function shouldShowPermissionsWizard(): Promise<boolean> {
  if (Platform.OS !== 'android') return false; // Android-only wizard; iOS handled inline in Alerts
  const state = await getPermState();
  for (const p of PERMISSIONS) {
    if (!p.relevant()) continue;
    if (state[p.key]?.asked) continue;
    const granted = await p.checkGranted();
    if (granted !== true) return true; // not granted (or unknown) and never asked
  }
  return false;
}

// ─── Manage-Permissions UI + monthly reminder ─────────────────────────────────

export type PermStatus = { key: PermKey; label: string; blurb: string; hint: string; granted: boolean | null };

/** All relevant permissions with their live status, for the "App Permissions" section in Alerts. */
export async function getPermissionsForManage(): Promise<PermStatus[]> {
  const out: PermStatus[] = [];
  for (const p of PERMISSIONS) {
    if (!p.relevant()) continue;
    out.push({ key: p.key, label: p.label, blurb: p.blurb, hint: p.hint, granted: await p.checkGranted() });
  }
  return out;
}

/** Launch the OS settings/intent to change a permission (from the Manage UI). Pass the current
 *  live status so an already-granted permission opens a screen where it can be turned off. */
export async function openPermission(key: PermKey, granted?: boolean | null): Promise<void> {
  await metaFor(key)?.open(granted);
}

/**
 * Returns permissions to remind the user about — at most ONCE per calendar month — that are
 * definitively OFF (only checkable ones; never nag about permissions we can't verify) and not
 * opted out. Marks the month as reminded so it won't fire again this month. Returns null if
 * nothing to remind.
 */
export async function maybeMonthlyReminder(): Promise<PermStatus[] | null> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const last = await AsyncStorage.getItem(REMINDER_MONTH_KEY).catch(() => null);
  if (last === month) return null;
  const state = await getPermState();
  const denied: PermStatus[] = [];
  for (const p of PERMISSIONS) {
    if (!p.relevant() || state[p.key]?.dontRemind) continue;
    const granted = await p.checkGranted();
    if (granted === false) denied.push({ key: p.key, label: p.label, blurb: p.blurb, hint: p.hint, granted });
  }
  await AsyncStorage.setItem(REMINDER_MONTH_KEY, month).catch(() => {});
  return denied.length ? denied : null;
}
