# EEIS Prayer Times — Build & Operations Manual

_Last updated: v77 (16 Jun 2026). This is the master reference for how the app is built,
operated, and updated. It contains no secrets — passphrases, tokens and the admin passcode
live only in the maintainers' private notes._

---

## 1. What the app is

A free Android prayer-times app for the **Epsom & Ewell Islamic Society**. Built once in
**Expo / React Native (TypeScript)**; the same codebase is designed to also produce the iOS
app later. Core promise: **accurate prayer times and reliable adhan alarms that fire even when
the phone is locked or in Do-Not-Disturb**, plus organisation-controlled announcements.

Everything the congregation sees can be updated **without shipping a new app** — see §4.

---

## 2. Architecture at a glance

```
App.tsx ─ orchestrates screens, deep links, billboard triggers
│
├─ hooks/
│   ├─ usePrayerTimes.ts        prayer state, BST, Hijri, next-prayer, year-rollover
│   ├─ useNotificationScheduler reschedules native alarms (10 days ahead) + iOS notifications
│   ├─ useAlertSettings         per-prayer settings (AsyncStorage)
│   └─ useAlarmState            live playing/paused state from the native service
│
├─ components/  (PrayerRow, CountdownStrip, AlertsScreen, BillboardSlideshow,
│                BillboardAdminScreen, QuoteManager, WorldTimesScreen, HelpScreen, …)
│
├─ data/        (the "back end" — all signed/remote content + helpers)
│   ├─ prayer-times.json        bundled 2026 timetable (the always-safe baseline)
│   ├─ prayerTimesRemote.ts     signed remote timetable override
│   ├─ jummahConfig.ts          signed summer/winter Jummah times
│   ├─ billboards.ts            signed campaigns + scrolling messages
│   ├─ quotes.ts                signed Quran/Hadith quotes + featured-quote broadcast
│   ├─ billboardSign.ts         Ed25519 sign/verify (integrity of all the above)
│   ├─ channel.ts               live vs TEST file routing
│   ├─ githubApi.ts             writes content to GitHub (admin) + commit attribution
│   ├─ secureStore.ts           admin passphrase in Keystore/Keychain
│   └─ shareFile.ts             large-CSV-safe file sharing
│
└─ plugins/android/  (the native alarm engine — Java)
    ├─ EeisAlarmModule.java      JS ↔ AlarmManager bridge
    ├─ EeisAlarmReceiver.java    fired by AlarmManager
    ├─ EeisAlarmService.java     foreground service: MediaPlayer(USAGE_ALARM)+torch+vibrate
    └─ EeisAlarmActivity.java    lock-screen alarm UI (prayer name/times, Arabic+English quote)
```

### Why the alarm engine is native (not JS)
Android 8+ locks notification-channel sounds and Samsung caches them; Doze mode and DND kill
ordinary notifications. We bypass all of that with a **foreground service playing on the ALARM
audio stream** via `AlarmManager.setExactAndAllowWhileIdle`. Confirmed firing on Samsung One UI
with the screen locked. This is the single most important reliability decision in the app.

---

## 3. The "always-safe" data model (read this before touching content)

Every remote content type follows the **same three-layer safety pattern**:

1. **Bundled default** ships inside the APK — the app works fully offline with this alone.
2. **Signed remote override** is fetched from the public GitHub repo and layered on top.
3. **Verification gate**: the remote file is accepted **only if its Ed25519 signature matches
   the public key baked into the app.** Missing / tampered / unsigned / malformed → silently
   ignored, app uses the bundled default.

Consequences:
- A leaked GitHub token **cannot** change what users see — only someone with the admin
  **passphrase** can produce a valid signature. (The token only lets you _write a file_; the
  signature is what makes the app _trust_ it.)
- The app **can never show blank or garbage prayer times** — worst case it falls back to the
  bundled 2026 table (and, past 2026, to the same calendar day from the bundled year).

This pattern is implemented for: prayer times, Jummah times, campaigns, scrolling messages,
quotes, and the featured quote.

---

## 4. Updating content — NO app release needed

These all take effect on users' phones automatically (within the cache window), because they
are just signed files in the GitHub repo that the app re-fetches:

| Content | Admin tool (in-app) | Live within |
|---|---|---|
| Prayer timetable | 🕌 Times → Download/Import CSV | ~next launch / 30 min |
| Jummah summer/winter times | 🕌 Times → Jummah inputs | ~30 min |
| Campaigns (posters/slides) | 📋 Campaigns | ~30 min |
| Scrolling messages | 📣 Messages | ~30 min |
| Quran/Hadith quotes | 🕌 Times → 🔎 Search & manage quotes (or CSV) | ~24 h (daily cache) |
| Featured quote (one quote to everyone) | Quote manager → 📌 Feature | ~next alarm |

**The admin never needs a developer or a new build to change any of the above.** They unlock
the admin panel (tap "Menu" in the hamburger → passcode), enter their name in "Editing as"
(so the change is logged to them in the git history), make the change, and publish.

---

## 5. Live vs TEST app (the safe sandbox)

`app.config.js` builds two variants from one codebase:
- **LIVE** (default): package `com.eeis.prayertimes`, reads the live config files.
- **TEST** (`APP_VARIANT=dev`): package `com.eeis.prayertimes.dev`, name "EEIS Test", reads
  the `*-test.json` files. Installs **side-by-side** with the live app.

Use the TEST app to rehearse content changes and try builds without affecting the public.
Build it from GitHub → Actions → **"Build Dev APK"**.

---

## 6. Building an APK (free, for testing/sideload)

- **Push to `main`** → GitHub Actions builds automatically, OR Actions tab → "Build Release
  APK" → Run workflow.
- The build runs `expo prebuild` (regenerates the native project + autolinks modules), patches
  Gradle memory, signs with a **consistent dev keystore**, and produces an APK.
- **Output:** every build now publishes a **public GitHub Release** (`EEIS-vXX.apk`) that
  downloads with no login and never expires. (It also still uploads a 30-day "release-apk"
  artifact.)
- ⚠️ These APKs are **sideload-only** — they are signed with the dev key and **cannot** be
  uploaded to the Play Store listing (see §7 of the Launch guide).

### Pre-commit checklist (enforced by convention, not CI)
1. `npx tsc --noEmit` must be clean.
2. After any Java edit: Python byte-scan for non-ASCII in code (comments/strings excepted).
3. Bump `constants/buildInfo.ts` (BUILD_VERSION) **and** `app.json` (versionCode) together.
4. Update `components/HelpScreen.tsx` in **all four languages** if behaviour/UI changed.
5. Never commit secrets or the local security deep-dive (it's gitignored).

---

## 7. Admin panel quick reference

- **Unlock:** hamburger → tap "Menu" title → enter passcode (kept in private notes). Persists.
- **Editing as:** type your name once — every save is attributed to you in the git history;
  "📝 Recent edits" (Help tab) shows who changed what.
- **Passphrase:** entered once on unlock, stored in the device Keystore. It is what signs your
  content so the app trusts it. Keep it secret — it is the real key to the app's content.
- **Tabs:** 📋 Campaigns · 📣 Messages · 🕌 Times (prayer times, Jummah, quotes) · ❓ Help.

---

## 8. Code audit summary (v77)

A full pass over the 16k-line codebase. Headline: **architecture is sound and launch-ready.**

**Verified healthy:**
- All event subscriptions (alarm state, deep links, magnetometer) clean up correctly — no leaks.
- Startup network calls are non-blocking (`.catch` fire-and-forget) — a slow network can't
  freeze launch.
- The alarm scheduler cancels stale alarms before rescheduling — no duplicate/ghost alarms.
- `JSON.parse` of caches/responses is wrapped in try/catch throughout.
- Signing chain verified end-to-end (sign→verify pass, tamper rejected) for every content type.

**Fixed in v75–v77:**
- Quotes CSV export froze the app (178 KB text share) → now shares as a file; cannot hang.
- Random tiny prayer names (Android `adjustsFontSizeToFit` mis-measure) → fixed sizing.
- Campaign slides stuck mid-swipe (fractional width vs paging) → exact snap interval.
- Main screen hardened against a malformed (but signed) remote timetable day → falls back.
- 12 s timeouts added to the quotes + timetable startup fetches.

**Known minor items (documented, not blocking launch):**
- `usePrayerTimes` re-renders every 1 s (drives the clock). Correct, but a future battery
  optimisation could tick on the minute for the heavy parts.
- A few non-critical network fetches (World Times weather/FX) still lack explicit timeouts;
  they already degrade to cache, so impact is cosmetic.
- A brand-new remote timetable updates the **display** immediately but **alarms** reschedule on
  next launch/settings-change (bundled fallback keeps everything correct in the meantime).

---

## 9. Troubleshooting (field guide)

| Symptom | Cause | Action |
|---|---|---|
| Alarm didn't fire (Samsung) | OEM battery killer | Battery → Unrestricted; Allow background; "Never sleeping apps" (only the first is API-settable) |
| Lock-screen alarm didn't appear (Android 14+) | Full-screen-intent permission off | Settings → Special app access → re-grant; app prompts once |
| Campaign image blank | CDN delay / wrong URL | Wait, re-open; check the image URL in admin |
| Content change not showing | Cache window not elapsed | Wait the cache window (table §4); pull to refresh where available |
| Prayer times look wrong after an import | Bad CSV | Re-import a corrected CSV; the app keeps the last good/bundled set |

See the repo `CLAUDE.md` for the deeper engineering learnings (notification-channel bypass,
expo-file-system read crash + XHR workaround, nested-Modal blanking fix, etc.).
