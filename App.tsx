import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Alert, Share,
  ActivityIndicator, Animated, Dimensions, PanResponder,
  TouchableOpacity, Linking, Platform, AppState, NativeModules,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

import {
  usePrayerTimes,
  getHijriDate,
  getDateKey,
  timeToMinutes,
  getPrayerDataForDate,
  isBST,
} from './hooks/usePrayerTimes';
import { useAlertSettings, wantsPopupIos } from './hooks/useAlertSettings';
import { useAudioPlayer }             from './hooks/useAudioPlayer';
import { useQuotes }                  from './hooks/useQuotes';
import { QuoteOverlay }               from './components/QuoteOverlay';
import {
  useNotificationScheduler,
  requestNotificationPermissions,
  setupNotificationCategories,
  setupNotificationChannels,
  stopCurrentAlarm,
  pauseCurrentAlarm,
  resumeCurrentAlarm,
} from './hooks/useNotificationScheduler';
import { useAlarmState } from './hooks/useAlarmState';
import { Header }           from './components/Header';
import { DateTimeBar }      from './components/DateTimeBar';
import { CountdownStrip }   from './components/CountdownStrip';
import { PrayerRow }        from './components/PrayerRow';
import { BottomBar }        from './components/BottomBar';
import { CalendarModal }    from './components/CalendarModal';
import { AlertsScreen }     from './components/AlertsScreen';
import { StopSoundButton }  from './components/StopSoundButton';
import { HamburgerMenu }        from './components/HamburgerMenu';
import { HelpScreen }           from './components/HelpScreen';
import { BillboardAdminScreen } from './components/BillboardAdminScreen';
import { QiblaScreen }          from './components/QiblaScreen';
import { DonateScreen }         from './components/DonateScreen';
import { BillboardSlideshow }   from './components/BillboardSlideshow';
import { WorldTimesScreen }     from './components/WorldTimesScreen';
import { PrayerInfoModal }     from './components/PrayerInfoModal';
import type { ActiveHeadline } from './components/CountdownStrip';
import {
  fetchBillboardConfig,
  forceFetchBillboardConfig,
  getActiveSlidesForPrayer,
  getTestSlidesForAdmin,
  getActiveScrollingMessages,
  getAllActiveScrollingMessages,
  recordBillboardPlay,
  type Billboard,
  type BillboardConfig,
} from './data/billboards';
import {
  PermissionsWizard,
  shouldShowPermissionsWizard,
  markPermissionsWizardDone,
} from './components/PermissionsWizard';
import { maybeMonthlyReminder, setDontRemind } from './data/permissionState';
import { recordNotifTap, maybeMonthlyNotifTapReminder } from './data/notifTapHabit';
import { Colors }           from './constants/theme';
import { sp }               from './constants/scaling';
import { getSoundDef }      from './data/soundOptions';
import { checkForUpdate }   from './data/appVersion';
import { IS_TEST }          from './data/channel';
import { initRemotePrayerTimes } from './data/prayerTimesRemote';
import { jummahForBst, initJummahConfig } from './data/jummahConfig';
import AsyncStorage         from '@react-native-async-storage/async-storage';
import { secureDelete, PASS_SECURE_KEY, PASS_LEGACY_KEY } from './data/secureStore';

// Handle notifications received while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // TEST alarms play their sound in-app (see the received listener) so they're reliably
    // audible when the app is open, even if iOS won't play a custom sound via foreground
    // presentation. Suppress the system sound for tests so it doesn't play twice.
    const isTest = (notification.request.identifier ?? '').startsWith('test_');
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      // iOS has no native alarm service, so the notification itself plays the sound when the
      // app is open (foreground). Android's foreground sound is handled by the native alarm
      // service, so it stays false there to avoid a double sound.
      shouldPlaySound: Platform.OS === 'ios' && !isTest,
      shouldSetBadge: false,
    };
  },
});

const SCREEN_WIDTH = Dimensions.get('window').width;
// Bead size: 5.5% of screen width, capped at 26dp — ~19dp on S20, ~22dp on S25

/**
 * Parses a scheduled notification identifier into its prayer key + whether it's a test.
 * Real:  "<prayerId>_<dateKey>"      e.g. "dhuhr_2026-07-01"      -> prayer = split[0]
 * Test:  "test_<prayerKey>"          e.g. "test_dhuhr"            -> prayer = split[1]
 * Used identically for real and test alarms so campaign/audio logic never has to special-case
 * tests — this is what makes test mirror reality.
 */
function parsePrayerKey(identifier: string): { prayer: string; isTest: boolean } {
  const isTest = identifier.startsWith('test');
  const prayer = isTest ? (identifier.split('_')[1] ?? '') : (identifier.split('_')[0] ?? '');
  return { prayer, isTest };
}

/** Normalises expo-notifications' `date` field (Date | number seconds) to epoch ms. */
function notifDateToMs(d: Date | number | undefined): number {
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'number') return d * 1000;
  return Date.now();
}

/** Returns an ActiveHeadline reminder if today is the day before a UK clock change. */
function getClockChangeTicker(): ActiveHeadline | null {
  const now  = new Date();
  const year = now.getUTCFullYear();
  // Find last Sunday of a given month (UTC month, 0-indexed)
  function lastSundayOf(month: number): Date {
    const d = new Date(Date.UTC(year, month + 1, 1)); // first of next month
    d.setUTCDate(d.getUTCDate() - 1); // last day of the month
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1); // walk back to Sunday
    return d;
  }
  const springSun = lastSundayOf(2); // last Sun of March
  const autumnSun = lastSundayOf(9); // last Sun of October
  const springSat = new Date(springSun); springSat.setUTCDate(springSun.getUTCDate() - 1);
  const autumnSat = new Date(autumnSun); autumnSat.setUTCDate(autumnSun.getUTCDate() - 1);
  const todayISO = now.toISOString().slice(0, 10);
  if (todayISO === springSat.toISOString().slice(0, 10)) {
    return {
      id: '__clock_spring__',
      text: '⏰ Tomorrow night clocks go FORWARD 1 hour — BST begins, you lose 1 hr sleep. Phone adjusts automatically.',
      linkType: 'none',
    };
  }
  if (todayISO === autumnSat.toISOString().slice(0, 10)) {
    return {
      id: '__clock_autumn__',
      text: '⏰ Tomorrow night clocks go BACK 1 hour — GMT returns, you gain 1 hr sleep. Phone adjusts automatically.',
      linkType: 'none',
    };
  }
  return null;
}

function getInitialViewDate(): Date {
  const now  = new Date();
  const data = getPrayerDataForDate(now);
  if (data) {
    const ishaM = timeToMinutes(data.isha[1]);
    const nowM  = now.getHours() * 60 + now.getMinutes();
    if (nowM > ishaM) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
  }
  return now;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Dismiss native splash when fonts are ready OR if they fail to load.
  // expo-font calls preventAutoHideAsync() automatically, so we MUST call
  // hideAsync() explicitly — the auto-hide on CONTENT_APPEARED is suppressed.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Hard safety net: force-hide the splash after 4 s regardless.
  // Protects against any race condition where the effect above doesn't fire.
  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // Alert settings + audio + notification scheduling (declared before the real-time hook because
  // the countdown mode feeds into next-prayer selection).
  const { settings, update, updatePrayer, loaded: settingsLoaded } = useAlertSettings();

  // Real-time hook
  const { now, next, hijri } = usePrayerTimes(settings.countdownMode);
  // The alarm pop-up card's quote is the exact quote baked into that occurrence at schedule time
  // (or picked fresh via getNextIosQuote for the icon-open catch-up path) — see quoteContext below
  // and the card-show call sites. `quotes`/`getNextIosQuote` are also used directly by those sites.
  const { getNextQuote: getNextIosQuote } = useQuotes();

  // Full quote box (tap the green bar, or auto on opening from a prayer notification).
  const [quoteOpen, setQuoteOpen] = useState(false);
  // When the catch-up shows the prayer card AND a campaign also applies, the campaign is shown
  // after the card is closed. This holds that pending prayer key.
  const catchupPendingCampaign = useRef<string | null>(null);
  // iOS: the same prayer occurrence can trigger play() from more than one place (lock-screen tap,
  // switching to the app without tapping, a delivered-notification scan) — without a guard, each
  // trigger restarts/reseeks playback, which is heard as "it plays again from the start." Only the
  // FIRST trigger for a given notification identifier actually starts audio; later triggers just
  // (re)show the card with Pause/Stop wired to the already-playing sound.
  const audioStartedForRef = useRef<string | null>(null);
  const [quoteContext, setQuoteContext] = useState<{ name?: string; begins?: string; jamaat?: string; withQuote?: boolean; quoteText?: string; quoteRef?: string; quoteArabic?: string } | null>(null);
  // Present the quote card as the ONLY modal: close any open screen FIRST, then show it after the
  // dismiss settles (~350ms). A Modal presented over another Modal on iOS leaves a touch-blocking
  // backdrop behind after it closes — that was the post-alarm freeze. The state setters are stable.
  const showQuote = useCallback((ctx?: { name?: string; begins?: string; jamaat?: string; withQuote?: boolean; quoteText?: string; quoteRef?: string; quoteArabic?: string } | null) => {
    setAlerts(false); setDonate(false); setQibla(false); setWorldTimes(false);
    setMenu(false); setCalendar(false); setPrayerInfoVisible(false);
    setQuoteContext(ctx ?? null);
    setTimeout(() => setQuoteOpen(true), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { play, preview, stop, pause, resume, isPaused, playerState } = useAudioPlayer();
  useNotificationScheduler(settings, settingsLoaded);

  // Native alarm state (Android only — EeisAlarmService via MediaPlayer/USAGE_ALARM)
  const alarmState = useAlarmState();

  // Request permissions and register notification categories + channels once on mount
  useEffect(() => {
    (async () => {
      // Permission prompting is owned ENTIRELY by the PermissionsWizard on Android (per-permission
      // "asked" tracking in data/permissionState.ts). The old inline prompts here
      // (promptBatteryOptimisationOnce / checkExactAlarmPermission / promptFullScreenIntentOnce)
      // used their OWN separate "shown" flags that the wizard never set, so they re-asked on the
      // next launch even after the user had already granted/declined in the wizard — that was the
      // "it keeps asking me again when I reopen" bug. Removed. Users revisit permissions any time
      // in Alerts → App Permissions, with a gentle once-a-month reminder. iOS has no wizard, so it
      // still asks for notifications once here (requestPermissionsAsync is a no-op after the first).
      await setupNotificationCategories();
      await setupNotificationChannels(); // single eeis-prayers channel with bypassDnd for all prayers
      if (Platform.OS === 'ios') {
        await requestNotificationPermissions();
      }
      checkForUpdate();                     // non-blocking version check
      // Load any admin-uploaded remote timetable + Jummah times (fall back to built-in)
      initRemotePrayerTimes().catch(() => {});
      initJummahConfig().catch(() => {});
      // Fetch billboard config (background, non-blocking)
      fetchBillboardConfig().then(cfg => { if (cfg) setBillboardConfig(cfg); }).catch(() => {});
    })();
  }, []);

  // Check admin status + load token once on mount (token needed for private-repo image auth)
  useEffect(() => {
    (async () => {
      // v105 key rotation: one-time purge of ALL previously stored passphrases and the
      // unlock flag. The old admin passphrase no longer matches the new signing key, so
      // we wipe any lingering copy (SecureStore + legacy AsyncStorage) and force a fresh
      // re-entry of the new passphrase. Runs once per device, then never again.
      const PURGE_FLAG = '@eeis_keyrot_v105_done';
      try {
        const done = await AsyncStorage.getItem(PURGE_FLAG);
        if (done !== 'true') {
          await secureDelete(PASS_SECURE_KEY, PASS_LEGACY_KEY);
          await AsyncStorage.removeItem('@eeis_admin_unlocked_v2').catch(() => {});
          await AsyncStorage.setItem(PURGE_FLAG, 'true').catch(() => {});
        }
      } catch { /* ignore — purge is best-effort */ }

      AsyncStorage.getItem('@eeis_admin_unlocked_v2').then(v => {
        if (v === 'true') setIsAdminUnlocked(true);
      }).catch(() => {});
      AsyncStorage.getItem('@eeis_admin_gh_token').then(t => {
        if (t) setAdminToken(t);
      }).catch(() => {});
    })();
  }, []);

  // Billboard state — declared here so showBillboardForPrayer can reference it
  const [billboardVisible, setBillboard]      = useState(false);
  const [billboardSlides, setBillboardSlides] = useState<Billboard[]>([]);
  const [billboardConfig, setBillboardConfig] = useState<BillboardConfig | null>(null);

  // iOS foreground screen-flash trigger (bumped to Date.now() to fire a 3× white flash)

  // Pending prayer key: if showBillboardForPrayer is called before config loads
  // (cold launch via notification/deep-link), we queue it here and fire on config arrival.
  const pendingBillboardPrayer = useRef<string | null>(null);

  // Mirror of billboardVisible + last trigger, for the dedupe guard (avoids stale closures).
  const billboardVisibleRef = useRef(false);
  useEffect(() => { billboardVisibleRef.current = billboardVisible; }, [billboardVisible]);
  const lastBillboardTrigger = useRef<{ prayer: string; ts: number }>({ prayer: '', ts: 0 });

  // ── Show-once-per-occurrence guard (v119) ───────────────────────────────────
  // A campaign must appear at most ONCE per prayer-occurrence per day — once the user has seen
  // (and can close) e.g. the Dhuhr campaign today, re-opening the app before the next occurrence
  // must NOT re-show it. Several paths can trigger a campaign for the same occurrence (app-open
  // catch-up, the native alarm-stop watcher, a notification tap, the flash-screen dismiss
  // deep-link) — the previous per-path guards only deduped the catch-up path and only in-memory,
  // so re-opening the app kept re-showing it. This persistent (day, prayer) record is the single
  // choke point every display path now funnels through, and survives app restarts.
  const campaignShown = useRef<{ day: string; prayers: Record<string, boolean> }>({ day: '', prayers: {} });
  useEffect(() => {
    AsyncStorage.getItem('@eeis_campaign_shown_v1').then(raw => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        if (s && typeof s.day === 'string' && s.prayers) campaignShown.current = s;
      } catch {}
    }).catch(() => {});
  }, []);

  // Present a campaign's slides for a prayer, but only if it hasn't already been shown for this
  // (day, prayer). Returns true if it was shown. Records the play + persists the shown-marker.
  const presentCampaignOnce = useCallback((prayerKey: string, slides: Billboard[], campaignId: string): boolean => {
    const today = getDateKey(new Date());
    let state = campaignShown.current;
    if (state.day !== today) state = { day: today, prayers: {} }; // new day → reset (auto-prunes old keys)
    if (state.prayers[prayerKey]) { campaignShown.current = state; return false; } // already shown this occurrence
    state.prayers[prayerKey] = true;
    campaignShown.current = state;
    AsyncStorage.setItem('@eeis_campaign_shown_v1', JSON.stringify(state)).catch(() => {});
    setBillboardSlides(slides);
    setBillboard(true);
    recordBillboardPlay(campaignId).catch(() => {});
    return true;
  }, []);

  // Show billboard for a given prayer key (if config has active campaign for it today).
  // The same prayer can be triggered by several paths near-simultaneously (the alarm
  // screen's dismiss deep-link, the notification tap, and the in-app alarm-stop watcher).
  // A dedupe guard ensures we only open the carousel once per prayer fire.
  const showBillboardForPrayer = useCallback((prayer: string) => {
    if (!prayer) return;
    const key = prayer.toLowerCase().replace(/\s+/g, '');
    const now = Date.now();
    if (billboardVisibleRef.current) return;                       // already showing
    const last = lastBillboardTrigger.current;
    if (last.prayer === key && now - last.ts < 5000) return;       // just fired for this prayer
    lastBillboardTrigger.current = { prayer: key, ts: now };

    if (!billboardConfig) {
      // Config not loaded yet (cold launch) — queue the prayer
      pendingBillboardPrayer.current = prayer;
      return;
    }
    getActiveSlidesForPrayer(prayer, billboardConfig).then(result => {
      if (result && result.slides.length > 0) {
        presentCampaignOnce(key, result.slides, result.campaignId);
      }
    }).catch(() => {});
  }, [billboardConfig, presentCampaignOnce]);

  // Close the prayer card; if a campaign was queued for the same prayer (catch-up), show it now.
  const closeQuoteCard = useCallback(() => {
    stop();   // closing the card dismisses any in-app adhan/test audio → no lingering Stop button
    setQuoteOpen(false);
    const p = catchupPendingCampaign.current;
    catchupPendingCampaign.current = null;
    if (p) setTimeout(() => showBillboardForPrayer(p), 400);
  }, [stop, showBillboardForPrayer]);

  // Android only: re-show the native flash/quote screen for a fresh, undismissed SPLASH alarm
  // (the "I got just a notification while in another app, now I opened EEIS" case). Returns true
  // if the native flash was shown. No-op / false on iOS (no native module).
  const showPendingNativeFlash = useCallback(async (sinceMs: number): Promise<boolean> => {
    try {
      const native = (NativeModules as any).EeisAlarm;
      if (Platform.OS !== 'android' || !native?.showPendingFlash) return false;
      return !!(await native.showPendingFlash(sinceMs));
    } catch { return false; }
  }, []);

  // iOS pop-up acknowledgement. `@eeis_ios_handled` holds the last notification identifier whose
  // card we already showed (so the delivered-notification scan below doesn't re-show it). For a
  // REAL prayer we also mark the catch-up's per-day seen key so the schedule-based card doesn't
  // double up. (Tests clear `@eeis_ios_handled` when re-scheduled, so a repeat test shows again.)
  const markIosShown = useCallback(async (identifier: string, prayer: string, isTest: boolean) => {
    try { await AsyncStorage.setItem('@eeis_ios_handled', identifier); } catch {}
    if (!isTest && prayer) {
      try { await AsyncStorage.setItem('@eeis_catchup_seen', `${getDateKey(new Date())}_${prayer}`); } catch {}
    }
  }, []);

  // iOS only: when the app becomes active, look at notifications still in the tray and, if a TEST
  // alarm is sitting there (popup-eligible) that we haven't shown yet, pop its card + queue its
  // campaign + resume its sound (seeked). This is what makes "lock screen → open the app without
  // tapping" work for tests, so test mirrors real (real prayers are already covered on open by
  // runPrayerCatchUp). Returns true if a card was shown.
  const maybeShowIosDeliveredCard = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS !== 'ios') return false;
      const delivered = await Notifications.getPresentedNotificationsAsync();
      const test = delivered.find(n => {
        const id = n.request.identifier || '';
        const d  = (n.request.content.data || {}) as any;
        return id.startsWith('test') && !!d.popup;
      });
      if (!test) return false;
      const id = test.request.identifier || '';
      const handled = await AsyncStorage.getItem('@eeis_ios_handled').catch(() => null);
      if (handled === id) return false; // already shown this test occurrence
      const { prayer } = parsePrayerKey(id);
      const d = (test.request.content.data || {}) as any;

      // Queue the campaign for this prayer, exactly like the tap/foreground paths — tests must
      // mirror reality, including showing the campaign after the card closes.
      let hasCampaign = false;
      if (billboardConfig && prayer) {
        const r = await getActiveSlidesForPrayer(prayer, billboardConfig).catch(() => null);
        hasCampaign = !!(r && r.slides.length > 0);
      }
      catchupPendingCampaign.current = hasCampaign ? prayer : null;
      showQuote({
        name: d.prayerName, begins: d.begins, jamaat: d.jamaat, withQuote: !!d.quotes,
        quoteText: d.quoteText, quoteRef: d.quoteRef, quoteArabic: d.quoteArabic,
      });

      // Keyed by identifier + fire time (not just identifier) so a REPEAT test — same identifier,
      // new fire time — is treated as a fresh occurrence and still plays.
      const fireMs = notifDateToMs(test.date as any);
      const occToken = `${id}|${fireMs}`;
      if (!settings.muteAll && !settings.muteSounds && d.soundKey && d.soundKey !== 'none'
          && audioStartedForRef.current !== occToken) {
        const def = getSoundDef(d.soundKey as any);
        const elapsed = Math.max(0, Date.now() - fireMs);
        if (def?.file) { play(def.file, settings.masterVolume, !!d.loopEnabled, elapsed); audioStartedForRef.current = occToken; }
      }

      await markIosShown(id, prayer, true);
      return true;
    } catch { return false; }
  }, [showQuote, markIosShown, billboardConfig, settings, play]);

  // ─── App-open catch-up ────────────────────────────────────────────────────────
  // Neither iOS nor Android can pop the app to the foreground on their own, so the reliable way
  // to reach EVERY user (even those with no alerts on, and those who don't tap the notification)
  // is to show things the first time they open the app after a prayer time. For the most recent
  // prayer that has started (valid until the next prayer, shown once per prayer occurrence):
  //   • Campaign for that prayer → shown on BOTH platforms (campaigns must reach everyone).
  //   • iOS only: the prayer flash card (times + quote if enabled), for prayers the user enabled.
  //     (Android already shows its native full-screen alarm at the time for enabled prayers.)
  const runPrayerCatchUp = useCallback(async (cfgOverride?: BillboardConfig | null) => {
    try {
      const now  = new Date();
      const data = getPrayerDataForDate(now);
      if (!data) return;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const friday = now.getDay() === 5;
      const { j1, j2 } = jummahForBst(isBST(now));
      const jOff = settings.jummah?.offsetMinutes ?? 0;
      // Each slot: atMin = the minute-of-day it becomes "current" (its alarm/begin time — used to
      // pick the most recent prayer); sKey = which settings block to read; begins/jamaat = what the
      // card shows. Jummah is jamaat-only (begins '') and becomes current from its notification time
      // (jamaat − offset). Crucially, Jummah 1 and Jummah 2 are SEPARATE occurrences with their own
      // ids/times/settings — the old single 'dhuhr' slot on Fridays swallowed Jummah 2 (both mapped
      // to one occurrence key + read Dhuhr's settings/times).
      type Slot = { id: string; sKey: string; name: string; atMin: number; begins: string; jamaat: string };
      const order: Slot[] = [
        { id: 'fajr',   sKey: 'fajr',   name: 'Fajr',   atMin: timeToMinutes(data.fajr[0]), begins: data.fajr[0], jamaat: data.fajr[1] },
        { id: 'shuruq', sKey: 'shuruq', name: 'Shuruq', atMin: timeToMinutes(data.shuruq),  begins: data.shuruq,  jamaat: data.shuruq },
      ];
      if (friday && (settings.jummah?.jamaat1 || settings.jummah?.jamaat2)) {
        if (settings.jummah?.jamaat1) order.push({ id: 'jummah1', sKey: 'jummah', name: 'Jummah', atMin: Math.max(timeToMinutes(j1) - jOff, 0), begins: '', jamaat: j1 });
        if (settings.jummah?.jamaat2) order.push({ id: 'jummah2', sKey: 'jummah', name: 'Jummah', atMin: Math.max(timeToMinutes(j2) - jOff, 0), begins: '', jamaat: j2 });
      } else {
        order.push({ id: 'dhuhr', sKey: 'dhuhr', name: friday ? 'Jummah' : 'Dhuhr', atMin: timeToMinutes(data.dhuhr[0]), begins: data.dhuhr[0], jamaat: data.dhuhr[1] });
      }
      order.push(
        { id: 'asr',     sKey: 'asr',     name: 'Asr',     atMin: timeToMinutes(data.asr[0]),  begins: data.asr[0],  jamaat: data.asr[1] },
        { id: 'maghrib', sKey: 'maghrib', name: 'Maghrib', atMin: timeToMinutes(data.maghrib), begins: data.maghrib, jamaat: data.maghrib },
        { id: 'isha',    sKey: 'isha',    name: 'Isha',    atMin: timeToMinutes(data.isha[0]),  begins: data.isha[0], jamaat: data.isha[1] },
      );
      // Most recent slot whose time has already passed today.
      let cur: Slot | null = null;
      for (const p of order) { if (p.atMin <= nowMin) cur = p; }
      if (!cur) return; // before Fajr — nothing today yet

      // ANDROID: re-show the native pop-up on open if there's an undismissed pop-up alarm that
      // fired within the CURRENT prayer's window (covers "I was in another app and only got a
      // notification"). The window starts at this prayer's begin time today, so the re-show is
      // valid until the next prayer. If it shows, the native screen owns it (its Stop fires the
      // campaign) — stop here. iOS has no native module → this is a no-op there.
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
      const curWindowStartMs = midnight.getTime() + cur.atMin * 60000;
      if (await showPendingNativeFlash(curWindowStartMs)) return;

      const occKey = `${getDateKey(now)}_${cur.id}`;
      const seen = await AsyncStorage.getItem('@eeis_catchup_seen').catch(() => null);
      if (seen === occKey) return; // already handled this prayer occurrence

      const curSettings = (settings as any)[cur.sKey];
      const quotesOn    = !!curSettings?.quotesEnabled;
      // The in-app card is the pop-up surface on iOS ONLY. On Android the native EeisAlarmActivity
      // is the pop-up (shown at the time + re-shown on open above), so the JS card never shows there
      // — which is what prevents the double screen. On iOS the card is also the only Stop button,
      // so it must show whenever a Sound is configured too (see wantsPopupIos), not just Notify/Quote.
      const showCard = Platform.OS === 'ios' && wantsPopupIos(curSettings);

      const cfg = cfgOverride ?? billboardConfig;
      let hasCampaign = false;
      if (cfg) {
        const r = await getActiveSlidesForPrayer(cur.id, cfg).catch(() => null);
        hasCampaign = !!(r && r.slides.length > 0);
      }

      // Nothing to show → leave it unmarked so a campaign published later in the window can still
      // catch them on a subsequent open.
      if (!showCard && !hasCampaign) return;

      await AsyncStorage.setItem('@eeis_catchup_seen', occKey).catch(() => {});

      if (showCard) {
        // Card first (both platforms); campaign (if any) fires when the card is closed. Quote
        // text: pick the same way scheduling does (there's no notification object on this path
        // to read a baked quote from — this is the icon-open catch-up, not a tap).
        const q = quotesOn ? getNextIosQuote() : null;
        catchupPendingCampaign.current = hasCampaign ? cur.id : null;
        showQuote({
          name: cur.name, begins: cur.begins, jamaat: cur.jamaat, withQuote: quotesOn,
          quoteText: q?.text, quoteRef: q?.reference, quoteArabic: q?.arabic,
        });

        // iOS only: resume this prayer's sound (seeked to the elapsed time since it actually
        // fired), for parity with the tap/foreground paths. Guarded so switching to the app again
        // for the same occurrence doesn't restart playback that's already going.
        if (!settings.muteAll && !settings.muteSounds && curSettings?.sound && curSettings.sound !== 'none'
            && audioStartedForRef.current !== occKey) {
          const def = getSoundDef(curSettings.sound as any);
          const elapsed = Math.max(0, Date.now() - curWindowStartMs);
          if (def?.file) { play(def.file, settings.masterVolume, !!curSettings.loopEnabled, elapsed); audioStartedForRef.current = occKey; }
        }
      } else if (hasCampaign) {
        showBillboardForPrayer(cur.id);
      }
    } catch {}
  }, [settings, billboardConfig, showQuote, showBillboardForPrayer, play, getNextIosQuote]);

  // Keep the LATEST catch-up callbacks in refs. runPrayerCatchUp/maybeShowIosDeliveredCard are
  // recreated whenever settings/billboardConfig change (which happens often, including from the
  // fetch this effect itself triggers) — if the effect below depended on them directly, it would
  // re-register the AppState listener AND immediately re-run refreshAndRun() on every such
  // change, not just on real foreground transitions. That caused the catch-up (campaign/sound
  // side effects) to repeatedly re-fire just from navigating the app (e.g. opening Alerts).
  const runPrayerCatchUpRef = useRef(runPrayerCatchUp);
  const maybeShowIosDeliveredCardRef = useRef(maybeShowIosDeliveredCard);
  useEffect(() => { runPrayerCatchUpRef.current = runPrayerCatchUp; }, [runPrayerCatchUp]);
  useEffect(() => { maybeShowIosDeliveredCardRef.current = maybeShowIosDeliveredCard; }, [maybeShowIosDeliveredCard]);

  // Run the catch-up when the app becomes active (and once on mount) — and ONLY then. Each time,
  // force a FRESH fetch of the campaign config first so a campaign edited on any device shows up
  // the next time a user opens the app (near-instant sync — true push isn't possible without a
  // server). The fresh config is passed straight into the catch-up so it doesn't wait for state.
  useEffect(() => {
    const refreshAndRun = () => {
      // iOS: re-show a TEST card sitting in the tray (covers lock → open without tapping, so test
      // mirrors real). No-op on Android / when nothing is pending.
      maybeShowIosDeliveredCardRef.current().catch(() => {});
      forceFetchBillboardConfig()
        .then(cfg => { if (cfg) setBillboardConfig(cfg); runPrayerCatchUpRef.current(cfg); })
        .catch(() => runPrayerCatchUpRef.current());
    };
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refreshAndRun(); });
    refreshAndRun();
    return () => sub.remove();
  // Mount-once: real AppState transitions (and the initial call) drive re-runs, not incidental
  // re-renders. See the ref comment above for why this deliberately has no other dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the campaign after the alarm is dismissed, even when the app is OPEN.
  // In the foreground the alarm is stopped via the in-app overlay (or the flash screen),
  // and we must guarantee the campaign still plays. We watch the native alarm state for an
  // active (playing/paused) → stopped transition and fire the billboard for that prayer.
  // The dedupe guard in showBillboardForPrayer prevents this from racing the alarm-screen
  // dismiss deep-link or a notification tap.
  const prevAlarmActiveRef  = useRef(false);
  const lastAlarmPrayerRef  = useRef('');
  useEffect(() => {
    const isActive = alarmState.isPlaying || alarmState.isPaused;
    if (isActive && alarmState.prayerName) lastAlarmPrayerRef.current = alarmState.prayerName;
    const wasActive = prevAlarmActiveRef.current;
    prevAlarmActiveRef.current = isActive;
    if (wasActive && !isActive && lastAlarmPrayerRef.current) {
      showBillboardForPrayer(lastAlarmPrayerRef.current);
    }
  }, [alarmState.isPlaying, alarmState.isPaused, alarmState.prayerName, showBillboardForPrayer]);

  // Admin test: force-fetch fresh config and show first active campaign regardless of filters
  const testBillboardPreview = useCallback(() => {
    // Close the Alerts screen first — on iOS a second Modal (the billboard) cannot present
    // while the Alerts Modal is still open, which is why the preview never appeared.
    setAlerts(false);
    getTestSlidesForAdmin().then(result => {
      if (result && result.slides.length > 0) {
        // getTestSlidesForAdmin already updated the AsyncStorage cache via forceFetchBillboardConfig
        // Refresh in-memory config too so subsequent prayer checks see latest data
        forceFetchBillboardConfig().then(cfg => { if (cfg) setBillboardConfig(cfg); }).catch(() => {});
        setBillboardSlides(result.slides);
        // Delay so the Alerts Modal has finished dismissing before the billboard presents.
        setTimeout(() => setBillboard(true), 400);
      } else {
        Alert.alert(
          'No Active Campaign',
          'No active campaign found in billboard-config.json.\n\nMake sure at least one campaign has active set to true.',
        );
      }
    }).catch(() => {
      Alert.alert('Billboard Test Failed', 'Could not fetch billboard config. Check your internet connection.');
    });
  }, []);

  // When config loads, fire ONLY a queued billboard prayer from a genuine cold-launch
  // trigger (a notification tap or eeis://billboard deep-link that arrived before the
  // config finished loading). We deliberately do NOT scan "did we open within 30 min of a
  // prayer" any more: that made the campaign pop up just from opening — including on a
  // fresh install/update when it isn't prayer time. The campaign now appears only at the
  // real prayer time, via the alarm flow (flash-screen dismiss, notification tap, or the
  // alarm-stop watcher).
  useEffect(() => {
    if (!billboardConfig) return;
    const pending = pendingBillboardPrayer.current;
    if (!pending) return;
    pendingBillboardPrayer.current = null;
    const key = pending.toLowerCase().replace(/\s+/g, '');
    getActiveSlidesForPrayer(pending, billboardConfig).then(result => {
      if (result && result.slides.length > 0) {
        presentCampaignOnce(key, result.slides, result.campaignId);
      }
    }).catch(() => {});
  // Only run when billboardConfig transitions from null → value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billboardConfig]);

  // Handle notification response: Stop Sound action OR default tap (show billboard)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      if (response.actionIdentifier === 'STOP_SOUND') {
        stop();
        return;
      }
      // Default tap — extract prayer from identifier e.g. 'fajr_2026-05-18' → 'fajr' ('test_dhuhr' → 'dhuhr')
      const identifier = response.notification.request.identifier;
      const { prayer, isTest } = parsePrayerKey(identifier);

      // iOS: opening from the notification (tap). Play the FULL-length adhan in-app (the
      // lock-screen sound is capped at 30s). Android's native alarm service handles its own
      // sound, so we skip this there.
      if (Platform.OS === 'ios') {
        // Real (non-test) prayer taps count toward the "is the user in the habit of tapping
        // notifications" monthly nudge — see data/notifTapHabit.ts.
        if (!isTest) recordNotifTap();
        const data = response.notification.request.content.data as
          { soundKey?: string; loopEnabled?: boolean; flash?: boolean; prayerName?: string; begins?: string; jamaat?: string; quotes?: boolean; quoteText?: string; quoteRef?: string; quoteArabic?: string; popup?: boolean } | undefined;
        // Show the pop-up card whenever this prayer wants one (Notify, Quote, or a Sound is set —
        // a Sound must always show the card, since it's the only way to reach Stop on iOS). The
        // quote section itself only appears if Quotes is on. Any campaign fires AFTER the card
        // closes (queued here, played by closeQuoteCard) — for BOTH real and test alarms, so a
        // test genuinely mirrors what a real prayer does.
        if (data?.popup) {
          if (prayer) catchupPendingCampaign.current = prayer;
          showQuote({
            name: data?.prayerName, begins: data?.begins, jamaat: data?.jamaat, withQuote: !!data?.quotes,
            quoteText: data?.quoteText, quoteRef: data?.quoteRef, quoteArabic: data?.quoteArabic,
          });
          markIosShown(identifier, prayer, isTest);
        }
        // Keyed by identifier + fire time so a REPEAT test (same identifier, new fire time) is
        // treated as a fresh occurrence and still plays.
        const fireMs = notifDateToMs(response.notification.date as any);
        const occToken = `${identifier}|${fireMs}`;
        if (!settings.muteAll && !settings.muteSounds && data?.soundKey && data.soundKey !== 'none'
            && audioStartedForRef.current !== occToken) {
          const def = getSoundDef(data.soundKey as any);
          // Seek to the elapsed time since the alarm actually fired, so the in-app playback picks
          // up roughly where the lock-screen sound left off instead of restarting from 0.
          const elapsed = Math.max(0, Date.now() - fireMs);
          if (def?.file) { play(def.file, settings.masterVolume, !!data.loopEnabled, elapsed); audioStartedForRef.current = occToken; }
        }
      } else {
        // Android: native alarm handled the prayer card; just show the campaign (if any).
        showBillboardForPrayer(prayer);
      }
    });
    return () => sub.remove();
  }, [stop, showBillboardForPrayer, settings, play, showQuote, markIosShown]);

  // Play in-app sound when notification arrives while app is in foreground.
  // Sound key is stored in notification data so we don't have to parse the identifier.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as
        { soundKey?: string; loopEnabled?: boolean; flash?: boolean; prayerName?: string; begins?: string; jamaat?: string; quotes?: boolean; quoteText?: string; quoteRef?: string; quoteArabic?: string; popup?: boolean } | undefined;
      const ident = notification.request.identifier ?? '';
      const { prayer: prayerKey, isTest } = parsePrayerKey(ident);
      // iOS: an alarm arriving while the app is OPEN — pop the card whenever this prayer wants one
      // (Notify, Quote, or a Sound is set). For TESTS play the sound in-app so it's reliably
      // audible (real prayers get the OS-played sound automatically while foregrounded — see
      // shouldPlaySound in the notification handler above). Any campaign fires after the card is
      // closed (queued; via closeQuoteCard) — for BOTH real and test alarms.
      if (Platform.OS === 'ios') {
        if (data?.popup) {
          if (prayerKey) catchupPendingCampaign.current = prayerKey;
          showQuote({
            name: data?.prayerName, begins: data?.begins, jamaat: data?.jamaat, withQuote: !!data?.quotes,
            quoteText: data?.quoteText, quoteRef: data?.quoteRef, quoteArabic: data?.quoteArabic,
          });
          markIosShown(ident, prayerKey, isTest);
        }
        const fireMs = notifDateToMs(notification.date as any);
        const occToken = `${ident}|${fireMs}`;
        if (!settings.muteAll && !settings.muteSounds && isTest && data?.soundKey && data.soundKey !== 'none'
            && audioStartedForRef.current !== occToken) {
          const def = getSoundDef(data.soundKey as any);
          const elapsed = Math.max(0, Date.now() - fireMs);
          if (def?.file) { play(def.file, settings.masterVolume, !!data.loopEnabled, elapsed); audioStartedForRef.current = occToken; }
        }
        return;
      }
      if (settings.muteAll || settings.muteSounds) return;
      // Android real alarms play via the native service, so this in-app play() only matters here.
      if (data?.soundKey && data.soundKey !== 'none') {
        const def = getSoundDef(data.soundKey as any);
        if (def?.file) {
          play(def.file, settings.masterVolume, !!data.loopEnabled);
        }
      }
    });
    return () => sub.remove();
  }, [settings, play, showQuote, markIosShown]);

  // Screen state
  const [viewDate, setViewDate]             = useState<Date>(getInitialViewDate);
  const [calendarVisible, setCalendar]      = useState(false);
  const [alertsVisible, setAlerts]          = useState(false);
  const [qiblaVisible, setQibla]            = useState(false);
  const [menuVisible, setMenu]              = useState(false);
  const [donateVisible, setDonate]          = useState(false);
  const [wizardVisible, setWizard]          = useState(false);
  const wizardVisibleRef = useRef(false);
  useEffect(() => { wizardVisibleRef.current = wizardVisible; }, [wizardVisible]);
  // Monthly permission reminder — at most once per calendar month, only for a checkable permission
  // that is definitively OFF and not opted out. A single dismissible dialog; never nags.
  useEffect(() => {
    const t = setTimeout(() => {
      if (wizardVisibleRef.current) return; // don't stack on the first-run wizard
      maybeMonthlyReminder().then(perms => {
        if (!perms || perms.length === 0 || wizardVisibleRef.current) return;
        const names = perms.map(p => p.label).join(', ');
        Alert.alert(
          'Prayer alert permissions',
          `Some permissions are off, so alarms may not work reliably: ${names}. Would you like to review them?`,
          [
            { text: "Don't remind me", style: 'destructive', onPress: () => { setDontRemind(perms.map(p => p.key)); } },
            { text: 'Not now', style: 'cancel' },
            { text: 'Review', onPress: () => setAlerts(true) },
          ],
        );
      }).catch(() => {});
    }, 3500);
    return () => clearTimeout(t);
  }, []);
  // Monthly "tap the notification" nudge (iOS only) — at most once per calendar month, only when
  // the user hasn't tapped a real prayer notification in the last 30 days. See data/notifTapHabit.
  useEffect(() => {
    const t = setTimeout(() => {
      if (wizardVisibleRef.current) return;
      maybeMonthlyNotifTapReminder().then(show => {
        if (!show || wizardVisibleRef.current) return;
        Alert.alert(
          'Tip: tap your prayer notifications',
          "On iPhone, tapping the prayer notification (instead of just opening the app) takes you straight to the full prayer details and quote. Try tapping it next time you see one!",
          [{ text: 'Got it' }],
        );
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, []);
  const [helpVisible, setHelp]              = useState(false);
  const [adminVisible, setAdmin]            = useState(false);
  const [worldTimesVisible, setWorldTimes]  = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminToken, setAdminToken] = useState<string | undefined>(undefined);

  // Prayer info modal (Hanafi rak'ahs)
  const [prayerInfoVisible, setPrayerInfoVisible] = useState(false);
  const [prayerInfoName,    setPrayerInfoName]    = useState('');

  // Tasbih counter — floating bead fixed to right side of Shuruq row by default.
  // User can drag it anywhere; position saved in AsyncStorage.
  // Tasbih counter — shown as fixed button inside Shuruq row (v46: replaced floating draggable bead)
  const [tasbihCount, setTasbihCount] = useState(0);

  // Tap count in DateTimeBar → reset to 0
  const handleTasbihReset = useCallback(() => {
    setTasbihCount(0);
  }, []);

  // Permissions wizard — show once on first launch
  useEffect(() => {
    shouldShowPermissionsWizard().then(show => {
      if (show) setWizard(true);
    });
  }, []);

  // Calendar button: ask Full Month (website) or Specific Date (picker)
  const handleCalendarPress = useCallback(() => {
    Alert.alert(
      'Prayer Times Calendar',
      'What would you like to view?',
      [
        {
          text: '📅  Full Month on Website',
          onPress: () => Linking.openURL('https://eeis.co.uk/prayer-times'),
        },
        {
          text: '🗓  Select a Specific Date',
          onPress: () => setCalendar(true),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, []);

  // Deep link handler — notification buttons (Qibla, Calendar, Donate) open eeis:// URIs.
  // React Native Linking fires on the initial URL (cold start) and on subsequent links.
  const handleDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    if (url.includes('qibla'))    { setQibla(true);      return; }
    if (url.includes('calendar')) { setCalendar(true);   return; }
    if (url.includes('donate'))   { setDonate(true);     return; }
    if (url.includes('world'))    { setWorldTimes(true); return; }
    if (url.includes('billboard')) {
      const prayerMatch = url.match(/prayer=([a-z]+)/i);
      const prayer = prayerMatch?.[1]?.toLowerCase() ?? '';
      showBillboardForPrayer(prayer);
      return;
    }
    // eeis://home — just bring app to foreground (no extra action needed)
  }, [showBillboardForPrayer]);

  useEffect(() => {
    // Handle URL that launched the app (cold start from notification tap)
    Linking.getInitialURL().then(handleDeepLink).catch(() => {});
    // Handle URLs received while app is running (notification button taps)
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [handleDeepLink]);
  const viewDateRef                     = useRef(viewDate);
  viewDateRef.current                   = viewDate;

  // Computed for viewed date
  const viewedData   = getPrayerDataForDate(viewDate);
  const viewedFriday = viewDate.getDay() === 5;
  const viewedBST    = isBST(viewDate);
  const { j1: jummahTime1, j2: jummahTime2 } = jummahForBst(viewedBST);

  const isViewingToday = getDateKey(viewDate) === getDateKey(now);
  const viewedHijri    = isViewingToday ? hijri : getHijriDate(viewDate);

  // Show countdown when viewing today, or auto-advanced to tomorrow after Isha
  const isAfterIsha = (() => {
    const todayData = getPrayerDataForDate(now);
    if (!todayData) return false;
    return (now.getHours() * 60 + now.getMinutes()) > timeToMinutes(todayData.isha[1]);
  })();
  const tomorrowDate   = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const isAutoAdvanced = isAfterIsha && getDateKey(viewDate) === getDateKey(tomorrowDate);
  const showCountdown  = (isViewingToday || isAutoAdvanced) && !!next;

  // Auto-advance viewDate to tomorrow when Isha passes (while still viewing today)
  useEffect(() => {
    if (isAfterIsha && getDateKey(viewDate) === getDateKey(now)) {
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      setViewDate(tom);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAfterIsha]);

  // Jama'at changed vs previous day
  const prevDate = new Date(viewDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevData     = getPrayerDataForDate(prevDate);
  const fajrChanged  = !!prevData && !!viewedData && prevData.fajr[1]  !== viewedData.fajr[1];
  const dhuhrChanged = !!prevData && !!viewedData && prevData.dhuhr[1] !== viewedData.dhuhr[1];
  const asrChanged   = !!prevData && !!viewedData && prevData.asr[1]   !== viewedData.asr[1];
  const ishaChanged  = !!prevData && !!viewedData && prevData.isha[1]  !== viewedData.isha[1];

  // Clock
  const clockText = now.toLocaleTimeString('en-GB', {
    hour12: false, hour: '2-digit', minute: '2-digit',
  });

  // Countdown text — adhan mode counts to begin time, iqamah mode counts to jamaat
  const countdownText = React.useMemo(() => {
    if (!next) return '';
    // adhan mode: use minutesUntilBegins (clamped to 0 when adhan has already passed)
    const mins = next.phase === 'begins' ? next.minutesUntilBegins : next.minutesUntil;
    return mins >= 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins}m`;
  }, [next]);

  // Scrolling headline — BST clock-change reminder only
  const activeHeadlines: ActiveHeadline[] = React.useMemo(() => {
    const clockChange = getClockChangeTicker();
    const base: ActiveHeadline[] = clockChange ? [clockChange] : [];
    // Quran/Hadith quote of the day — scrolls in full on the green bar so it can always be read
    // (iOS notifications truncate it). Shown after any clock-change ticker, before campaign msgs.
    // The Quran/Hadith quote is NOT shown on the green bar any more — it appears in full on the
    // alarm pop-up card instead. The bar shows only the countdown + any admin scrolling messages.
    // Scrolling messages: show ALL active messages (date+dow match) all day,
    // not filtered by prayer so they scroll continuously in the countdown strip
    if (billboardConfig) {
      const msgs = getAllActiveScrollingMessages(billboardConfig);
      const msgHeadlines: ActiveHeadline[] = msgs.map(m => ({
        id:       m.id,
        text:     m.text,
        linkType: 'none' as const,
        scrollSpeed: m.scrollSpeed,
        fontScale:   m.fontScale,
        color:       m.color,
        bold:        m.bold,
        italic:      m.italic,
        underline:   m.underline,
        highlight:   m.highlight,
        flash:       m.flash,
      }));
      return [...base, ...msgHeadlines];
    }
    return base;
  }, [billboardConfig]);

  // Mute toggle (stops any playing sound immediately)
  const handleMuteToggle = () => {
    if (!settings.muteAll) stop();
    update({ muteAll: !settings.muteAll });
  };

  // Share app via native share sheet.
  // The hamburger menu calls onClose() then onShare() — on iOS the system share sheet can't
  // present while the menu Modal is still dismissing, so it silently did nothing. Defer the
  // share until after the menu has closed (harmless on Android).
  const handleShare = useCallback(() => {
    // Platform-aware store link — iPhones got the Android link before.
    const APP_STORE = 'https://apps.apple.com/app/id6781048296';
    const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.eeis.prayertimes';
    const link = Platform.OS === 'ios' ? APP_STORE : PLAY_STORE;
    setTimeout(() => {
      Share.share({
        title: 'EEIS Prayer Times App',
        message:
          '📿 EEIS Prayer Times\n\n' +
          'Accurate prayer times for Epsom & Ewell Islamic Society, with Adhan alerts for every prayer.\n\n' +
          'Download free:\n' + link + '\n\n' +
          'Forward to friends & family 🕌',
      }).catch(() => {});
    }, 400);
  }, []);

  // Preview handler for alerts screen sound picker
  const handlePreview = useCallback((file: any) => {
    if (settings.muteAll || settings.muteSounds) return;
    // Always preview at a reasonable volume — masterVolume may be 0 from an older build
    const vol = Math.max(0.8, settings.masterVolume ?? 0.8);
    preview(file, vol);
  }, [preview, settings.muteAll, settings.muteSounds, settings.masterVolume]);

  // ── Swipe animation ──────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateToDay = (targetDate: Date, direction: 'forward' | 'back') => {
    if (!getPrayerDataForDate(targetDate)) {
      Animated.spring(slideAnim, { toValue: 0, speed: 20, bounciness: 4, useNativeDriver: true }).start();
      return;
    }
    const exitTo    = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const enterFrom = direction === 'forward' ?  SCREEN_WIDTH : -SCREEN_WIDTH;
    Animated.timing(slideAnim, { toValue: exitTo, duration: 200, useNativeDriver: true }).start(() => {
      setViewDate(targetDate);
      viewDateRef.current = targetDate;
      slideAnim.setValue(enterFrom);
      Animated.spring(slideAnim, { toValue: 0, speed: 16, bounciness: 2, useNativeDriver: true }).start();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => { slideAnim.setValue(gs.dx); },
      onPanResponderRelease: (_, gs) => {
        const isForward = gs.dx < -60 || (gs.dx < -20 && gs.vx < -0.5);
        const isBack    = gs.dx >  60 || (gs.dx >  20 && gs.vx >  0.5);
        if (isForward) {
          const d = new Date(viewDateRef.current);
          d.setDate(d.getDate() + 1);
          animateToDay(d, 'forward');
        } else if (isBack) {
          const d = new Date(viewDateRef.current);
          d.setDate(d.getDate() - 1);
          animateToDay(d, 'back');
        } else {
          Animated.spring(slideAnim, { toValue: 0, speed: 20, bounciness: 4, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideAnim, { toValue: 0, speed: 20, bounciness: 4, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingScreen}>
          <StatusBar barStyle="light-content" backgroundColor={Colors.blueDeep} />
          <ActivityIndicator size="large" color={Colors.freshGreen} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        <Header
          clockText={clockText}
          fontsLoaded={fontsLoaded}
          onHamburgerPress={() => setMenu(true)}
          onClockPress={() => setWorldTimes(true)}
        />

        {/* TEST-build banner — only in the dev/test app (com.eeis.prayertimes.dev), so it is
            never confused with the live Play Store app. Live app never shows this. */}
        {IS_TEST && (
          <View style={styles.testBanner}>
            <Text style={styles.testBannerText}>TEST APP · sandbox content channel</Text>
          </View>
        )}

        {/* Native alarm overlay — large, prominent, easy to tap at Fajr */}
        {(alarmState.isPlaying || alarmState.isPaused) && (
          <View style={styles.alarmOverlay}>
            {/* Info row */}
            <View style={styles.alarmOverlayInfo}>
              <Text style={styles.alarmOverlayIcon}>🕌</Text>
              <View style={styles.alarmOverlayTextGroup}>
                <Text style={styles.alarmOverlayPrayer}>{alarmState.prayerName} Prayer Time</Text>
                <Text style={styles.alarmOverlaySub}>
                  {alarmState.isPaused ? 'Paused — tap ▶ to resume' : 'Adhan is playing'}
                </Text>
              </View>
            </View>
            {/* Large action buttons */}
            <View style={styles.alarmOverlayBtns}>
              <TouchableOpacity
                style={[styles.alarmOverlayBtn, styles.alarmOverlayBtnPause]}
                onPress={() => alarmState.isPaused ? resumeCurrentAlarm() : pauseCurrentAlarm()}
                activeOpacity={0.75}
              >
                <Text style={styles.alarmOverlayBtnText}>
                  {alarmState.isPaused ? '▶  Resume' : '⏸  Pause'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alarmOverlayBtn, styles.alarmOverlayBtnStop]}
                onPress={() => stopCurrentAlarm()}
                activeOpacity={0.75}
              >
                <Text style={styles.alarmOverlayBtnText}>⏹  Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Animated.View
          style={[styles.swipeable, { transform: [{ translateX: slideAnim }] }]}
          {...panResponder.panHandlers}
        >
          <View>
            <DateTimeBar
              viewDate={viewDate}
              hijri={viewedHijri}
              onPress={() => setCalendar(true)}
              fontsLoaded={fontsLoaded}
              tasbihCount={tasbihCount}
              onTasbihReset={handleTasbihReset}
            />
          </View>

          {showCountdown && next && (
            <CountdownStrip
              prayerName={next.name}
              remaining={countdownText}
              fontsLoaded={fontsLoaded}
              headlines={activeHeadlines}
              countdownMode={next.phase === 'begins' ? 'adhan' : 'iqamah'}
            />
          )}

          {/* Back to Today pill — visible when browsing a non-today, non-auto-advanced date */}
          {!isViewingToday && !isAutoAdvanced && (
            <TouchableOpacity
              style={styles.todayPill}
              onPress={() => {
                const today = new Date();
                const dir = getDateKey(viewDate) > getDateKey(today) ? 'back' : 'forward';
                animateToDay(today, dir);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.todayPillText}>↩ Back to Today</Text>
            </TouchableOpacity>
          )}

          {viewedData ? (
            <View style={styles.prayerList}>
              <PrayerRow
                name="FAJR"
                beginsTime={viewedData.fajr[0]}
                jamaatTime={viewedData.fajr[1]}
                isNext={isViewingToday && !isAfterIsha && next?.id === 'fajr'}
                jamaatChanged={fajrChanged}
                fontsLoaded={fontsLoaded}
                fontScale={settings.fontScale ?? 1.0}
                onNamePress={() => { setPrayerInfoName('FAJR'); setPrayerInfoVisible(true); }}
              />
              <PrayerRow
                name="SHURUQ"
                beginsTime={viewedData.shuruq}
                singleLabel="Sunrise"
                isNext={false}
                fontsLoaded={fontsLoaded}
                fontScale={settings.fontScale ?? 1.0}
                onNamePress={() => { setPrayerInfoName('SHURUQ'); setPrayerInfoVisible(true); }}
                tasbihVisible={settings.tasbihVisible}
                tasbihCount={tasbihCount}
                onTasbihTap={() => setTasbihCount(c => c + 1)}
              />
              <PrayerRow
                name="DHUHR"
                beginsTime={viewedData.dhuhr[0]}
                jamaatTime={viewedData.dhuhr[1]}
                isNext={isViewingToday && !isAfterIsha && (next?.id === 'dhuhr' || next?.id === 'jummah1' || next?.id === 'jummah2')}
                isFriday={viewedFriday}
                jummahTime1={jummahTime1}
                jummahTime2={jummahTime2}
                jamaatChanged={!viewedFriday && dhuhrChanged}
                fontsLoaded={fontsLoaded}
                fontScale={settings.fontScale ?? 1.0}
                onNamePress={() => { setPrayerInfoName(viewedFriday ? 'JUMMAH' : 'DHUHR'); setPrayerInfoVisible(true); }}
              />
              <PrayerRow
                name="ASR"
                beginsTime={viewedData.asr[0]}
                jamaatTime={viewedData.asr[1]}
                isNext={isViewingToday && !isAfterIsha && next?.id === 'asr'}
                jamaatChanged={asrChanged}
                fontsLoaded={fontsLoaded}
                fontScale={settings.fontScale ?? 1.0}
                onNamePress={() => { setPrayerInfoName('ASR'); setPrayerInfoVisible(true); }}
              />
              <PrayerRow
                name="MAGHRIB"
                jamaatTime={viewedData.maghrib}
                isNext={isViewingToday && !isAfterIsha && next?.id === 'maghrib'}
                fontsLoaded={fontsLoaded}
                fontScale={settings.fontScale ?? 1.0}
                onNamePress={() => { setPrayerInfoName('MAGHRIB'); setPrayerInfoVisible(true); }}
              />
              <PrayerRow
                name="ISHA"
                beginsTime={viewedData.isha[0]}
                jamaatTime={viewedData.isha[1]}
                isNext={isViewingToday && !isAfterIsha && next?.id === 'isha'}
                jamaatChanged={ishaChanged}
                fontsLoaded={fontsLoaded}
                fontScale={settings.fontScale ?? 1.0}
                onNamePress={() => { setPrayerInfoName('ISHA'); setPrayerInfoVisible(true); }}
              />
            </View>
          ) : (
            <View style={styles.noData}>
              <Text style={styles.noDataText}>No prayer times for this date.</Text>
            </View>
          )}
        </Animated.View>

        <BottomBar
          onCalendarPress={handleCalendarPress}
          onAlertsPress={() => setAlerts(true)}
          onQiblaPress={() => setQibla(true)}
          onWorldPress={() => setWorldTimes(true)}
          onBankTransferPress={() => setDonate(true)}
          fontsLoaded={fontsLoaded}
        />

      </SafeAreaView>

      <CalendarModal
        visible={calendarVisible}
        selectedDate={viewDate}
        onSelectDate={(date) => { setViewDate(date); setCalendar(false); }}
        onClose={() => setCalendar(false)}
        fontsLoaded={fontsLoaded}
      />

      <AlertsScreen
        visible={alertsVisible}
        settings={settings}
        onUpdate={update}
        onUpdatePrayer={updatePrayer}
        onClose={() => setAlerts(false)}
        onPreview={handlePreview}
        onStopPreview={stop}
        isPlaying={playerState.isPlaying}
        playingDuration={playerState.durationSec}
        fontsLoaded={fontsLoaded}
        alarmState={alarmState}
        isAdmin={isAdminUnlocked}
        onTestBillboard={testBillboardPreview}
      />

      <StopSoundButton
        visible={playerState.showStopButton && !quoteOpen}
        onStop={stop}
        fontsLoaded={fontsLoaded}
      />

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenu(false)}
        onShare={handleShare}
        onDonatePress={() => setDonate(true)}
        onAlertsPress={() => setAlerts(true)}
        onHelpPress={() => setHelp(true)}
        onAdminPress={() => setAdmin(true)}
        fontsLoaded={fontsLoaded}
      />

      <HelpScreen
        visible={helpVisible}
        onClose={() => setHelp(false)}
        fontsLoaded={fontsLoaded}
      />

      <BillboardAdminScreen
        visible={adminVisible}
        onClose={() => {
          setAdmin(false);
          // Re-fetch fresh config so any campaign/message just saved shows immediately
          forceFetchBillboardConfig().then(cfg => { if (cfg) setBillboardConfig(cfg); }).catch(() => {});
        }}
        fontsLoaded={fontsLoaded}
      />

      <WorldTimesScreen
        visible={worldTimesVisible}
        onClose={() => setWorldTimes(false)}
        fontsLoaded={fontsLoaded}
      />

      <DonateScreen
        visible={donateVisible}
        onClose={() => setDonate(false)}
        fontsLoaded={fontsLoaded}
      />

      <QiblaScreen
        visible={qiblaVisible}
        onClose={() => setQibla(false)}
        fontsLoaded={fontsLoaded}
      />

      <BillboardSlideshow
        visible={billboardVisible}
        slides={billboardSlides}
        authToken={adminToken}
        autoPlay
        onClose={() => setBillboard(false)}
      />

      <PermissionsWizard
        visible={wizardVisible}
        onDone={() => {
          setWizard(false);
          markPermissionsWizardDone();
        }}
      />

      {/* Hanafi rak'ah info modal — opened by tapping any prayer name */}
      <PrayerInfoModal
        visible={prayerInfoVisible}
        prayerName={prayerInfoName}
        onClose={() => setPrayerInfoVisible(false)}
        fontsLoaded={fontsLoaded}
      />

      {/* Full Quran/Hadith quote box — tap the green bar, or auto on opening from a notification */}
      <QuoteOverlay
        visible={quoteOpen}
        quote={quoteContext?.quoteText ? { id: 0, text: quoteContext.quoteText, reference: quoteContext.quoteRef ?? '', arabic: quoteContext.quoteArabic } : null}
        context={quoteContext}
        withQuote={quoteContext?.withQuote !== false}
        isPlaying={playerState.isPlaying}
        isPaused={isPaused}
        onPause={() => { if (isPaused) resume(); else pause(); }}
        onStop={() => { stop(); closeQuoteCard(); }}
        onClose={closeQuoteCard}
        onGive={() => { stop(); catchupPendingCampaign.current = null; setQuoteOpen(false); setTimeout(() => setDonate(true), 350); }}
        onGiftAid={() => { stop(); catchupPendingCampaign.current = null; setQuoteOpen(false); setTimeout(() => setDonate(true), 350); }}
        onQibla={() => { stop(); catchupPendingCampaign.current = null; setQuoteOpen(false); setTimeout(() => setQibla(true), 350); }}
        onWorld={() => { stop(); catchupPendingCampaign.current = null; setQuoteOpen(false); setTimeout(() => setWorldTimes(true), 350); }}
      />

    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgScreen,
  },
  testBanner: {
    backgroundColor: '#C62828',
    paddingVertical: 4,
    alignItems: 'center',
  },
  testBannerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  loadingScreen: {
    flex: 1, backgroundColor: Colors.blueDeep,
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  loadingText: { color: '#FFFFFF', fontSize: 16 },
  swipeable: { flex: 1 },
  prayerList: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 5,
    gap: 3,
  },
  noData: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  noDataText: { color: Colors.inkMute, fontSize: 16 },

  todayPill: {
    alignSelf: 'center',
    backgroundColor: Colors.deepBlue,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
    marginBottom: 2,
  },
  todayPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Native alarm overlay (large card — visible and tappable at Fajr) ─────
  alarmOverlay: {
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: 3,
    borderBottomColor: Colors.maroonRed,
  },
  alarmOverlayInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alarmOverlayIcon: {
    fontSize: 36,
  },
  alarmOverlayTextGroup: {
    flex: 1,
  },
  alarmOverlayPrayer: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  alarmOverlaySub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 2,
  },
  alarmOverlayBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  alarmOverlayBtn: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmOverlayBtnPause: {
    backgroundColor: Colors.deepBlue,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  alarmOverlayBtnStop: {
    backgroundColor: Colors.maroonRed,
  },
  alarmOverlayBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

});
