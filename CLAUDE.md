# EEIS Prayer Times App — Project Documentation

## Working Principles

### No Subagents

Do not spawn subagents for this project. This is a standing rule, not a per-task decision.

**Why:** Past experience showed that agents writing Java/TypeScript code without a local compile step introduced silent syntax errors (curly-quote string delimiters, triple-quote text blocks) that only surfaced after 10-minute EAS cloud builds. Each failure wasted a build cycle with no useful error output from the CLI. The time cost of agent-introduced bugs far outweighed any parallelism benefit.

**The only exception:** a task that is (a) completely independent of all other project files, (b) has a clear pass/fail signal that doesn't require a build, and (c) offers a massive, unambiguous time saving. If in doubt, do it in the main conversation.

**Instead:**
- Keep all code changes in the main conversation where full project context is maintained
- After any Java edit: immediately run a Python byte-scan for non-ASCII chars
- After any TypeScript edit: run `npx tsc --noEmit` before committing
- Only commit and trigger an EAS build when both checks pass clean

---

## Overview

Mobile app for the **Epsom & Ewell Islamic Society (EEIS)**.  
Cross-platform iOS + Android, built with **Expo (React Native)** + TypeScript.  
Published via **EAS Build** to Google Play Store (Android live). iOS pending.

---

## App Identity

| Field | Value |
|-------|-------|
| App name | EEIS Prayer Times |
| Organisation | Epsom & Ewell Islamic Society |
| Founded | 2001 |
| Bundle ID (iOS) | com.eeis.prayertimes |
| Package name (Android) | com.eeis.prayertimes |
| Version | 1.0.0 (versionCode 27) |
| EAS Project ID | e85cfc6a-9f88-46f2-81d8-94db7927af76 |
| EAS Account | eeis |

---

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Expo SDK | 54.x | Framework |
| React Native | 0.81.x | UI runtime |
| TypeScript | 5.x | Language |
| EAS CLI | latest | Cloud builds + store submission |
| @expo-google-fonts/poppins | latest | Poppins 400/500/600/700/800 |
| react-native-safe-area-context | latest | Safe area insets |
| expo-av | 16.x | In-app audio preview |
| expo-notifications | 0.32.x | iOS notifications + Android fallback |
| expo-intent-launcher | 13.x | Android battery/alarm/full-screen permission intents |
| expo-document-picker | 55.x | Custom sound file picker |
| expo-file-system | 55.x | Custom sound file copy/cache |
| @react-native-community/slider | latest | Font size + offset sliders |

---

## Architecture

```
eeis-app/
├── App.tsx                           # Root — prayer times, swipe nav, deep links
├── app.json                          # Expo config (icons, permissions, plugins)
├── eas.json                          # EAS profiles: preview=APK, production=AAB
├── assets/
│   ├── logo.png                      # EEIS logo (Header badge, alarm screen)
│   └── sounds/                       # Bundled adhan + notification sounds
│       ├── fajr_shuruq/              # Fajr/Shuruq-specific sounds (longer)
│       └── std/                      # Standard sounds (adhan, notify_1–6)
├── constants/
│   ├── theme.ts                      # Brand colours + font families
│   └── scaling.ts                    # sp(), screenScale, maxFontScale (device-adaptive)
├── data/
│   ├── prayer-times.json             # Full 2026 prayer times (YYYY-MM-DD → {fajr,shuruq,...})
│   ├── soundOptions.ts               # SoundKey type, FAJR_SHURUQ_SOUNDS, STANDARD_SOUNDS
│   └── billboards.ts                 # Billboard config + remote fetch logic (v16+)
├── hooks/
│   ├── usePrayerTimes.ts             # Real-time prayer state, Hijri date, BST detection
│   ├── useAlertSettings.ts           # Alert prefs (AsyncStorage @eeis_alert_settings_v1)
│   ├── useNotificationScheduler.ts   # Schedules alarms via EeisAlarm native module
│   ├── useAudioPlayer.ts             # In-app audio preview (expo-av)
│   └── useAlarmState.ts              # Polls EeisAlarmModule for playing/paused state
├── components/
│   ├── Header.tsx                    # Logo + clock
│   ├── DateTimeBar.tsx               # Gregorian + Hijri date, opens calendar
│   ├── CountdownStrip.tsx            # Green countdown to next prayer
│   ├── PrayerRow.tsx                 # Single prayer row (adaptive font scale)
│   ├── BottomBar.tsx                 # Tab bar (Time/Alerts/Donate/Settings)
│   ├── CalendarModal.tsx             # Month grid picker
│   ├── AlertsScreen.tsx              # Prayer alert settings (sounds, modes, offsets)
│   ├── DonateScreen.tsx              # Bank transfer + Gift Aid + Standing Order tabs
│   ├── HamburgerMenu.tsx             # Side menu (share, donate, alerts)
│   ├── QiblaScreen.tsx               # Qibla compass (already implemented)
│   ├── StopSoundButton.tsx           # Floating stop button during preview
│   ├── BillboardSlideshow.tsx        # Remote-controlled org announcements (v16+)
│   └── PermissionsWizard.tsx         # First-launch Android permissions guide
└── plugins/
    ├── withPrayerAlarmService.js     # Expo config plugin — copies Java files + merges manifest
    └── android/
        ├── EeisAlarmModule.java      # React Native native module (JS ↔ AlarmManager)
        ├── EeisAlarmReceiver.java    # BroadcastReceiver — fired by AlarmManager
        ├── EeisAlarmService.java     # ForegroundService — MediaPlayer + torch + vibrate
        └── EeisAlarmActivity.java    # Lock screen overlay (EEIS logo, prayer name/times)
```

---

## Prayer Times Data Format

```json
{
  "YYYY-MM-DD": {
    "fajr":    ["HH:MM", "HH:MM"],
    "shuruq":  "HH:MM",
    "dhuhr":   ["HH:MM", "HH:MM"],
    "asr":     ["HH:MM", "HH:MM"],
    "maghrib": "HH:MM",
    "isha":    ["HH:MM", "HH:MM"]
  }
}
```

Arrays are `[begins, jamaat]`. Shuruq and Maghrib are single strings.

---

## Brand Colours (constants/theme.ts)

| Token | Hex | Usage |
|-------|-----|-------|
| `deepBlue` | `#0B5EA8` | Nav, buttons, active states |
| `blueDeep` | `#063968` | Header bg, alarm screen bg |
| `maroonRed` | `#8B1A2E` | Prayer names, donate, Friday |
| `freshGreen` | `#4CAF50` | Clock, countdown strip, switches |
| `bgScreen` | `#F5F5F5` | Screen background |
| `ink` | `#1A1A1A` | Primary text |
| `inkMute` | `#6B6B6B` | Labels, hints |

---

## Responsive Scaling

### Screen scale (`constants/scaling.ts`)
- `screenScale = clamp(H/800, 0.9, 1.25)` — height-based, referenced to S20
- `sp(n)` — applies screenScale to any size
- `maxFontScale = min(1.4, (W-56)/(2×screenScale×100.2))` — max safe user font scale so prayer times never wrap in PrayerRow

### DonateScreen
- `ds = clamp(physicalPixelWidth/1080, 1.0, 1.5)` — physical pixel width based
- `dp(n)` — applies ds scaling

---

## Native Alarm System (Android)

The alarm system bypasses Android's notification channel restriction for custom sounds by using a native foreground service with `AudioAttributes.USAGE_ALARM`.

### Chain
1. **JS** (`useNotificationScheduler.ts`) → calls `EeisAlarm.scheduleAlarm(alarmId, epochMs, soundName, prayerName, body, loop, alarmMode, customSoundUri)`
2. **`EeisAlarmModule.java`** → `AlarmManager.setExactAndAllowWhileIdle` → stores extras in `PendingIntent`
3. **`EeisAlarmReceiver.java`** → `ContextCompat.startForegroundService(EeisAlarmService)` with all extras
4. **`EeisAlarmService.java`** → starts foreground notification + `MediaPlayer(USAGE_ALARM)` + torch + vibrate → `fullScreenIntent` → `EeisAlarmActivity`
5. **`EeisAlarmActivity.java`** → `setShowWhenLocked(true)` + `setTurnScreenOn(true)` → shows prayer name/times + Pause/Stop buttons

### Why USAGE_ALARM
- Bypasses Do Not Disturb on all Android versions
- Plays on alarm audio stream (separate from media/notification)
- Confirmed working on Samsung One UI 7 / Android 16 with screen locked

### Custom Sounds
- User picks file via `expo-document-picker` (`type: '*/*'`, validated by extension)
- Copied to `documentDirectory/custom_sounds/` (persists across restarts)
- Stored as `customSoundUri` (file:// URI) in per-prayer `AlertSettings`
- Service plays from URI using `mediaPlayer.setDataSource(uri)` when `soundName === 'custom'`

---

## Per-Prayer Alarm Effects (v18+)

Each prayer card has 5 independent tick-box effects (all off by default):

| Flag | Effect |
|------|--------|
| `splashEnabled` | Lock screen flash-then-reveal: EeisAlarmActivity background strobes white 3× then shows prayer content |
| `flashEnabled` | Rear torch LED pulses 3× via `CameraManager.setTorchMode()` |
| `vibrateEnabled` | Vibration on alarm fire |
| `loopEnabled` | Loop audio until dismissed (was Fajr/Shuruq only, now all prayers) |
| `quotesEnabled` | Show Quran quote — in EeisAlarmActivity when Splash is also on, otherwise in expanded notification body |

Migration from old `alarmMode` string: translated to equivalent per-prayer booleans on first load.

## Quran Quotes System (v19+)

- **Source:** `quotes.json` in repo root — 1,310 entries, format `{ id, text, reference }`
- **Fetch:** `data/quotes.ts` → `fetchQuotes()` — fetches from GitHub raw URL, cached daily in `@eeis_quotes_v1`
- **Selection (v24+):** Sequential cycling via `getNextQuote()`. Index persisted in `@eeis_quote_index_v1` AsyncStorage key. Cycles 0 → 1309 → 0 across all alarm fires. 10 hardcoded fallbacks used only when quotes have never been fetched.
- **Splash ON + Quotes ON:** Quote card shown in EeisAlarmActivity above footer (italic text + reference)
- **Splash OFF + Quotes ON:** Quote appended to expanded notification body (`BigTextStyle`)
- **Hook:** `hooks/useQuotes.ts` — `useQuotes()` for React components

---

## Billboard System (v16+)

**Purpose:** Organisation-controlled announcements shown at specific prayer times on specific days. Not persistent/always-on — only shown when centrally instructed.

**Config JSON** hosted at a public URL (GitHub raw recommended):
```json
{
  "version": 1,
  "campaigns": [
    {
      "id": "eid-2026",
      "active": true,
      "startDate": "2026-03-28",
      "endDate": "2026-04-05",
      "prayers": ["fajr", "maghrib", "isha"],
      "displayDurationSec": 12,
      "slides": [
        { "id": "eid-1", "imageUrl": "https://...", "title": "Eid Mubarak!", "body": "..." }
      ]
    }
  ]
}
```

**Trigger:** Prayer time notification tap (deep link `eeis://billboard?prayer=fajr`). NOT idle timer. Config fetched once per day on launch and cached.

**Hosting recommendation:** GitHub repo `eeis/app-billboards` — free, EEIS staff can edit `config.json` via the web interface. Config URL hardcoded in `data/billboards.ts`.

---

## Key Behaviours

- **Auto-advance**: After Isha Jama'at, tomorrow's times shown automatically
- **Swipe navigation**: Left = next day, Right = prev day (animated)
- **Hijri date**: Advances at Maghrib; JD offset −1525 algorithm
- **Friday/Jumu'ah**: Dhuhr row → JUMMAH, two jamaat times (BST-aware)
- **Jama'at changed**: Red underline bar on jamaat time if different from previous day
- **Countdown**: Green strip when viewing today/auto-advanced tomorrow
- **Back to Today pill**: Appears when browsing non-today dates

---

## Permissions (Android)

All requested at first launch via `PermissionsWizard`:

| Permission | Purpose |
|-----------|---------|
| POST_NOTIFICATIONS | Prayer time alerts (Android 13+) |
| SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM | Precise alarm timing |
| REQUEST_IGNORE_BATTERY_OPTIMIZATIONS | Prevent Samsung/OEM from killing alarms |
| USE_FULL_SCREEN_INTENT | Lock screen overlay (Android 14+) |
| VIBRATE | Vibration on alarm |
| WAKE_LOCK | Keep CPU awake during alarm |
| FOREGROUND_SERVICE_MEDIA_PLAYBACK | MediaPlayer in foreground service |
| RECEIVE_BOOT_COMPLETED | (Future: reschedule alarms after reboot) |
| FLASHLIGHT / CAMERA | Torch flash during alarm |
| ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION | Qibla compass |
| ACCESS_NOTIFICATION_POLICY | DND bypass |

---

## Build Profiles (eas.json)

| Profile | Output | Use |
|---------|--------|-----|
| `preview` | APK | Sideload for testing (no Play Store) |
| `production` | AAB | Google Play submission |

Build command: `eas build --platform android --profile preview`

---

## Version History

| Version | versionCode | Key changes |
|---------|------------|-------------|
| v1–v5 | 1–5 | Initial build; notification channel sound research |
| v6–v10 | 6–10 | Native alarm service (EeisAlarmService); lock screen Activity |
| v11 | 11 | Font scaling (sp/ds); DonateScreen; QiblaScreen |
| v12 | 12 | Sample sound fix; font slider (Medium→Large only); Back to Today; name format fix |
| v13 | 13 | Dynamic maxFontScale (screen-width derived); nameCol sp(98)→sp(75) |
| v14 | 14 | 4-mode alarm effect (radio); test alarm with real Fajr times; ScrollView in EeisAlarmActivity; BEGINS/JAMA'AT columns; USE_FULL_SCREEN_INTENT check |
| v15–v17 | 15–17 | Permissions wizard; Billboard slideshow; Custom sounds (file picker); Torch flash; 6 alarm modes |
| v18 | 18 | Per-prayer effect flags (splash/flash/vibrate/loop/quotes tick buttons) replacing global alarmMode; permissions wizard key v2 + real permission check on every launch; test alarm 30s; alarm screen logo 114dp + statusbar clearance; Donate chip → AlertDialog; video extensions (.mp4/.mov/.3gp) in picker |
| v19 | 19 | Quran quotes system: 1,310 quotes fetched from GitHub + cached daily; random quote shown in EeisAlarmActivity (when Splash+Quotes) or appended to notification body (when Quotes without Splash) |
| v20–v21 | 20–21 | File picker crash fix; URL input in sound picker; mute toggles cancel native alarms; splash screen gated on splashEnabled; dhuhr/asr/isha offset from jamaat; default settings (dhuhr/asr/maghrib/isha/jummah ON, 45-min pre-jamaat) |
| v22 | 22 | Begins/Jama'at pill selector per prayer; personal media library (20 items, YouTube title fetch, add/delete via hamburger menu); file picker crash fixed (expo-file-system/legacy → expo-file-system); YouTube URL plays notify_1 chime + Open Video button on alarm screen; notification quote fills expanded area (BigTextStyle); test alarm 15s with real quotes; q() fallback quote; permissions wizard checks all 4 on every open; fontScale default 1.4 |
| v23 | 23 | Alarm stability fixes; build-system corrections |
| v24 | 24 | Removed all custom media functionality (file-picker crashes); sequential quotes (1,310 cycling, `@eeis_quote_index_v1` persisted); alarm screen redesigned: logo 60dp left-aligned, prayer name right of logo, org label removed; BEGINS+JAMA'AT always shown with amber highlight on active column; circular side-by-side Pause+Stop buttons; screen scale factor (0.75–1.0) for S20/S25 height; "← select" hint moved next to pills; beginsTime/jamaatTime/useJamaat extras threaded through full Java chain |
| v25 | 25 | Default settings v4: Shuruq ON by default (45 min offset), Jummah defaults to Jama'at mode; alarm screen v25: logo top-right, prayer name centred, BEGINS/JAMA'AT label 13sp, surah ref 17sp, buttons further apart, chips/footer lower; Help & Guide screen (English/Urdu/Bengali) in hamburger menu; in-app version check via GitHub manifest; CLAUDE.md updated |
| v26 | 26 | Billboard wiring: fires when Stop is pressed on alarm screen (dismiss() deep link eeis://billboard?prayer=xxx); daysOfWeek filter added to billboard config (Thursday=4); billboard-config.json configured with Jummah posters for Thursdays at Dhuhr |
| v27 | 27 | Help screen: real Urdu + Bengali translations (all 5 sections), close button inside ScrollView, larger non-Latin pill text, "Screen Flash" terminology; Admin panel: secret entry (tap "Menu" title → passcode 348871), full GUI to upload posters to GitHub, set prayer/day/duration per slide, image thumbnail preview in editor, inline preview (no nested Modal), save to GitHub; XHR+FileReader for image read (fixes expo-file-system crash); per-slide displayDurationSec; BillboardSlideshow: autoPlay prop, per-slide duration, close-on-last-swipe |

---

## Media Upload Architecture (Admin Panel)

### Problem: expo-file-system crashes on Android (SDK 54)

Both `expo-file-system` and `expo-file-system/legacy` throw `NoClassDefFoundError: FilePermissionService$Permission` on Android when calling `readAsStringAsync`. This is a known SDK 54 native module incompatibility — the Kotlin class is missing from the compiled binary.

### Solution: XHR + FileReader (pure JS, zero native modules)

```typescript
function readUriAsBase64(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new Error('XHR failed'));
    xhr.open('GET', uri, true);
    xhr.send();
  });
}
```

**Why it works:** React Native's Hermes runtime exposes `XMLHttpRequest` and `FileReader` as global web APIs. These fetch the `content://` URI returned by expo-document-picker, convert it to a Blob, then to a base64 data URL. No native module involved. Works on all Android versions and all OEMs.

**Usage pattern (image upload to GitHub):**
1. `DocumentPicker.getDocumentAsync({ type: 'image/*' })` → `content://` URI
2. `readUriAsBase64(uri)` → raw base64 string
3. GitHub REST API PUT with base64 content → raw URL
4. Store raw URL in `billboard-config.json` → app fetches and displays

### Nested Modal bug on Android (preview blank screen)

Android silently blanks a `<Modal>` nested inside another `<Modal>`. The inner modal renders as a plain background colour with no content.

**Fix:** Use `StyleSheet.absoluteFill` + a plain `<View>` overlay inside the outer modal instead of a second Modal. The overlay sits on top of all content within the same modal context without triggering Android's nested modal blank.

```tsx
{previewVisible && (
  <View style={StyleSheet.absoluteFill}>
    <View style={styles.previewRoot}>
      {/* FlatList / slides here — NOT a Modal */}
    </View>
  </View>
)}
```

### GitHub API: SHA required for file updates

To overwrite an existing file in GitHub via the REST API, you must include the current file's SHA in the PUT body. `uploadImageToGitHub()` in `data/githubApi.ts` does a GET first to fetch the SHA, then passes it in the PUT. New files (no GET result) omit the SHA.

### Security: PAT stored in AsyncStorage, not bundled

The GitHub Personal Access Token is entered by the admin in the Settings tab of AdminPanel and stored in `@eeis_admin_gh_token` AsyncStorage key. It is never hardcoded in the app binary. Decompiling the APK reveals no credentials.

---

## Known Issues / Learnings

### Samsung battery optimisation
Samsung "Device Care" kills idle app alarms. Three settings needed:
1. Battery → Unrestricted (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS API)
2. Apps → EEIS → Battery → Allow background activity
3. Device Care → Battery → Background usage limits → add to "Never sleeping apps"
Only #1 can be done via API. #2 and #3 require user action.

### Android notification channel sound
Android 8+ locks channel sound at creation. Samsung One UI caches even after deletion. We bypassed this entirely by using `USAGE_ALARM` in a ForegroundService — sound never goes through notification channels.

### USE_FULL_SCREEN_INTENT (Android 14+)
On Android 14 (API 34+), USE_FULL_SCREEN_INTENT must be explicitly granted by user in Settings → Special app access. Without it, `fullScreenIntent` is silently downgraded. We prompt once via `PermissionsWizard` and `promptFullScreenIntentOnce()`.

### expo-document-picker audio filter
`type: 'audio/*'` does NOT reliably show MP3 files on Samsung One UI's file manager. Fix: use `type: '*/*'` and validate by file extension (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`).

### Qibla
Already implemented — do not list as a future feature.

---

## Deep Link Scheme (`eeis://`)

| URI | Action |
|-----|--------|
| `eeis://home` | Bring app to foreground |
| `eeis://qibla` | Open Qibla screen |
| `eeis://calendar` | Open calendar picker |
| `eeis://donate` | Open Donate screen |
| `eeis://billboard?prayer=fajr` | Show billboard for that prayer (v16+) |

---

## Future Items

- **iOS build** — Apple Developer Program required ($99/yr); iOS AlarmKit (iOS 19+) for native alarm screen
- **Google Play production AAB** — when app is fully tested
- **Hamburger drawer** — DrawerNavigator with Prayer Times, Qibla, About EEIS, Contact
- **Reboot alarm rescheduling** — RECEIVE_BOOT_COMPLETED + reschedule logic
- **Billboard advertising** — `sponsor` field in campaign config, "Sponsored" label on slide
- **Remote prayer times** — Fetch from EEIS website/API instead of bundled JSON (monthly updates)
- **Jummah schedule changes** — Support for BST/GMT Jummah time changes mid-year
