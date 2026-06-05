import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Alert, Share,
  ActivityIndicator, Animated, Dimensions, PanResponder,
  TouchableOpacity, Linking, Platform,
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
import { useAlertSettings }           from './hooks/useAlertSettings';
import { useAudioPlayer }             from './hooks/useAudioPlayer';
import {
  useNotificationScheduler,
  requestNotificationPermissions,
  setupNotificationCategories,
  setupNotificationChannels,
  promptBatteryOptimisationOnce,
  checkExactAlarmPermission,
  promptFullScreenIntentOnce,
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
import { Colors }           from './constants/theme';
import { sp }               from './constants/scaling';
import { getSoundDef }      from './data/soundOptions';
import { checkForUpdate }   from './data/appVersion';
import AsyncStorage         from '@react-native-async-storage/async-storage';

// Handle notifications received while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false, // Custom sounds handled by useAudioPlayer
    shouldSetBadge: false,
  }),
});

const SCREEN_WIDTH = Dimensions.get('window').width;
// Bead size: 5.5% of screen width, capped at 26dp — ~19dp on S20, ~22dp on S25

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

  // Real-time hook
  const { now, next, hijri } = usePrayerTimes();

  // Alert settings + audio + notification scheduling
  const { settings, update, updatePrayer, loaded: settingsLoaded } = useAlertSettings();
  const { play, preview, stop, playerState } = useAudioPlayer();
  useNotificationScheduler(settings, settingsLoaded);

  // Native alarm state (Android only — EeisAlarmService via MediaPlayer/USAGE_ALARM)
  const alarmState = useAlarmState();

  // Request permissions and register notification categories + channels once on mount
  useEffect(() => {
    (async () => {
      await requestNotificationPermissions();
      await setupNotificationCategories();
      await setupNotificationChannels(); // single eeis-prayers channel with bypassDnd for all prayers
      // Universal prompts — work on all Android OEMs (Samsung, Xiaomi, Huawei, OnePlus, etc.)
      await promptBatteryOptimisationOnce(); // asks OS to exempt app from battery restrictions
      await checkExactAlarmPermission();     // Android 12 only: Alarms & Reminders permission
      await promptFullScreenIntentOnce();   // Android 14+ only: full screen alarm overlay
      checkForUpdate();                     // non-blocking version check
      // Fetch billboard config (background, non-blocking)
      fetchBillboardConfig().then(cfg => { if (cfg) setBillboardConfig(cfg); }).catch(() => {});
    })();
  }, []);

  // Check admin status + load token once on mount (token needed for private-repo image auth)
  useEffect(() => {
    AsyncStorage.getItem('@eeis_admin_unlocked_v2').then(v => {
      if (v === 'true') setIsAdminUnlocked(true);
    }).catch(() => {});
    AsyncStorage.getItem('@eeis_admin_gh_token').then(t => {
      if (t) setAdminToken(t);
    }).catch(() => {});
  }, []);

  // Billboard state — declared here so showBillboardForPrayer can reference it
  const [billboardVisible, setBillboard]      = useState(false);
  const [billboardSlides, setBillboardSlides] = useState<Billboard[]>([]);
  const [billboardConfig, setBillboardConfig] = useState<BillboardConfig | null>(null);

  // Pending prayer key: if showBillboardForPrayer is called before config loads
  // (cold launch via notification/deep-link), we queue it here and fire on config arrival.
  const pendingBillboardPrayer = useRef<string | null>(null);

  // Mirror of billboardVisible + last trigger, for the dedupe guard (avoids stale closures).
  const billboardVisibleRef = useRef(false);
  useEffect(() => { billboardVisibleRef.current = billboardVisible; }, [billboardVisible]);
  const lastBillboardTrigger = useRef<{ prayer: string; ts: number }>({ prayer: '', ts: 0 });

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
        setBillboardSlides(result.slides);
        setBillboard(true);
        recordBillboardPlay(result.campaignId).catch(() => {});
      }
    }).catch(() => {});
  }, [billboardConfig]);

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
    getTestSlidesForAdmin().then(result => {
      if (result && result.slides.length > 0) {
        // getTestSlidesForAdmin already updated the AsyncStorage cache via forceFetchBillboardConfig
        // Refresh in-memory config too so subsequent prayer checks see latest data
        forceFetchBillboardConfig().then(cfg => { if (cfg) setBillboardConfig(cfg); }).catch(() => {});
        setBillboardSlides(result.slides);
        setBillboard(true);
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

  // When config loads, fire any queued billboard prayer (from cold launch),
  // then also check if we're within 30 min of a recent prayer.
  useEffect(() => {
    if (!billboardConfig) return;

    // Fire pending prayer from cold launch first
    const pending = pendingBillboardPrayer.current;
    if (pending) {
      pendingBillboardPrayer.current = null;
      getActiveSlidesForPrayer(pending, billboardConfig).then(result => {
        if (result && result.slides.length > 0) {
          setBillboardSlides(result.slides);
          setBillboard(true);
          recordBillboardPlay(result.campaignId).catch(() => {});
        }
      }).catch(() => {});
      return; // don't also fire the app-open check on the same config load
    }

    // App-open fallback: check if we opened within 30 min of a recent prayer
    const todayData = getPrayerDataForDate(new Date());
    if (!todayData) return;
    const curMins = new Date().getHours() * 60 + new Date().getMinutes();
    const prayers = [
      { id: 'fajr',    time: timeToMinutes(todayData.fajr[1]) },
      { id: 'dhuhr',   time: timeToMinutes(todayData.dhuhr[1]) },
      { id: 'asr',     time: timeToMinutes(todayData.asr[1]) },
      { id: 'maghrib', time: timeToMinutes(todayData.maghrib) },
      { id: 'isha',    time: timeToMinutes(todayData.isha[1]) },
    ];
    const WINDOW = 30; // minutes
    for (const p of prayers) {
      const diff = curMins - p.time;
      if (diff >= 0 && diff <= WINDOW) {
        showBillboardForPrayer(p.id);
        break;
      }
    }
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
      // Default tap — extract prayer from identifier e.g. 'fajr_2026-05-18' → 'fajr'
      const identifier = response.notification.request.identifier;
      const prayer = identifier.split('_')[0] ?? '';
      showBillboardForPrayer(prayer);
    });
    return () => sub.remove();
  }, [stop, showBillboardForPrayer]);

  // Play in-app sound when notification arrives while app is in foreground.
  // Sound key is stored in notification data so we don't have to parse the identifier.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(notification => {
      if (settings.muteAll || settings.muteSounds) return;
      const data = notification.request.content.data as
        { soundKey?: string; loopEnabled?: boolean } | undefined;
      if (data?.soundKey && data.soundKey !== 'none') {
        const def = getSoundDef(data.soundKey as any);
        if (def?.file) {
          play(def.file, settings.masterVolume, !!data.loopEnabled);
        }
      }
    });
    return () => sub.remove();
  }, [settings, play]);

  // Screen state
  const [viewDate, setViewDate]             = useState<Date>(getInitialViewDate);
  const [calendarVisible, setCalendar]      = useState(false);
  const [alertsVisible, setAlerts]          = useState(false);
  const [qiblaVisible, setQibla]            = useState(false);
  const [menuVisible, setMenu]              = useState(false);
  const [donateVisible, setDonate]          = useState(false);
  const [wizardVisible, setWizard]          = useState(false);
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
  const jummahTime1  = viewedBST ? '13:15' : '12:40';
  const jummahTime2  = viewedBST ? '13:50' : '13:15';

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
    const mins = settings.countdownMode === 'adhan'
      ? next.minutesUntilBegins
      : next.minutesUntil;
    return mins >= 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins}m`;
  }, [next, settings.countdownMode]);

  // Scrolling headline — BST clock-change reminder only
  const activeHeadlines: ActiveHeadline[] = React.useMemo(() => {
    const clockChange = getClockChangeTicker();
    const base: ActiveHeadline[] = clockChange ? [clockChange] : [];
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

  // Share app via native share sheet
  const handleShare = useCallback(() => {
    Share.share({
      title: 'EEIS Prayer Times App',
      message:
        '📿 EEIS Prayer Times\n\n' +
        'Accurate prayer times for Epsom & Ewell Islamic Society, with Adhan alerts for every prayer.\n\n' +
        'Download free on Android:\n' +
        'https://play.google.com/store/apps/details?id=com.eeis.prayertimes\n\n' +
        'Forward to friends & family 🕌',
    });
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
              countdownMode={settings.countdownMode}
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
        visible={playerState.showStopButton}
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

    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgScreen,
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
