# EEIS Prayer Times — Technical Overview, Security & Stability Assessment

*Audience: the programmer/designer (you). Plain-English where possible, with the technical
detail underneath. Last updated: v59, June 2026.*

---

## 1. What the app is, in one paragraph

A cross-platform (Android live; iOS planned) prayer-times app for the Epsom & Ewell
Islamic Society. It shows daily prayer times, fires lock-screen **alarms/adhan** at prayer
time, lets admins push **announcement posters (billboards)** and **scrolling messages**
remotely, and bundles a toolkit: **Qibla compass**, **World Times** (prayer times, weather
and currency for cities abroad), and a **currency calculator/charts**. It is built to keep
working **offline and forever** — the core never depends on a server.

---

## 2. What it's built in (the toolkit)

| Layer | Technology | Why |
|-------|-----------|-----|
| App framework | **Expo (React Native) SDK 54** | One TypeScript codebase → Android + iOS |
| Language | **TypeScript** | Catches errors before they ship |
| UI | React Native components + Poppins fonts | Native performance, custom branding |
| Native alarm (Android) | **Custom Java** (`EeisAlarm*` foreground service) | Plays adhan over Do-Not-Disturb on the lock screen — not possible with notifications alone |
| Prayer maths | Bundled JSON timetable + `adhan` library (for Mecca/Medina) | Offline, exact |
| Config signing | **tweetnacl** (Ed25519) + **expo-crypto** (SHA-256) | Stops anyone faking campaigns/messages |
| Builds | **GitHub Actions** (free) → APK | No paid build service needed |
| Storage on device | **AsyncStorage** | Settings, caches, admin unlock flag |
| Remote content | **GitHub repo** over HTTPS | Free hosting EEIS staff can edit |

---

## 3. Where every piece of data lives (the important part)

There are only **two places** data lives: **inside the app** (ships with the APK) and **in
one GitHub repo** (`madrasah-del/EEIS-Prayer-times`, public). Nothing else, no database, no
paid server.

| Data | Where it lives | Fetched over network? | If network/repo is down |
|------|----------------|----------------------|--------------------------|
| **Prayer timetable** | **Bundled in the app** (`data/prayer-times.json`) | **No** | Works 100% — it's inside the app |
| **Prayer alarms** | Scheduled on the device by Android | **No** | Works 100% — offline |
| **Qibla compass** | Device magnetometer + location | No (location once) | Works |
| **Billboard campaigns** | GitHub `billboard-config.json` + `billboards/*.jpg` | Yes (cached 30 min) | Last cached version shows; or nothing |
| **Scrolling messages** | GitHub `billboard-config.json` | Yes (cached) | As above |
| **Quran quotes** (alarm screen) | GitHub `quotes.json` | Yes (cached daily) | Falls back to 10 built-in quotes |
| **World Times — prayer** | AlAdhan API (free) / `adhan` lib for Saudi | Yes | Saudi works offline; others blank gracefully |
| **World Times — weather** | Open-Meteo API (free) | Yes | Shows nothing, no crash |
| **World Times — currency** | FloatRates → 2 fallback APIs (free) | Yes | Uses stale cache; no crash |

**Key takeaway:** the two things that *matter most* — **prayer times and alarms** — are
fully on-device and need **no network, no GitHub, no money, ever**. Everything that depends
on GitHub or external APIs is a *secondary* feature, and each degrades gracefully.

---

## 4. Tokens & repositories, explained simply

- There is **one GitHub repository** that holds the editable content (billboard config,
  poster images, quotes). It is **public**, so any phone can *read* it with no token and no
  limit.
- There is **one access token** (a GitHub "fine-grained Personal Access Token") baked into
  the app. It is used **only when an admin uploads** a poster or saves a campaign (a *write*).
  Normal users never use it.
- The token is **scoped to just this one repo, Contents read/write only**. It cannot touch
  any other repository, cannot change account settings, cannot delete the repo.
- Admin actions are gated by a **shared passphrase**. The passphrase also creates a
  cryptographic **signature** on the config. The app refuses to display any config that
  isn't correctly signed. So even if someone extracted the token, **they could not make the
  app show fake posters or messages** without also knowing the passphrase.

Think of it as: *the token is the key to the filing cabinet; the passphrase is the wax seal.
A stolen key lets you open the cabinet, but the app only trusts documents that carry the
genuine seal.*

---

## 5. Security & hacking risk assessment

### What's well-protected
- **Prayer times & alarms** — bundled and on-device. No attack surface over the network.
- **Billboard config & messages** — Ed25519-signed. A leaked token alone cannot inject
  content the app will display (unsigned/invalid → app shows nothing).
- **Token blast radius** — limited to one repo's contents. No account-level access.
- **No user accounts, no personal data collected** — nothing to breach. Donations go via
  the bank/Give-a-Little externally; the app never handles card numbers.

### Real weaknesses (ranked)

1. **Hardcoded token is extractable.** Anyone who decompiles the APK can read the token.
   *Impact:* they could write junk into the repo (upload garbage images, or **edit
   `quotes.json`, which is NOT signature-protected**, so offensive text could appear on the
   alarm screen). They could also burn through the token's rate limit.
   *Mitigations in place:* config signing (campaigns/messages safe), repo-only token scope.
   *Recommended hardening:* (a) **sign `quotes.json` too**, or stop fetching it remotely and
   bundle the quotes; (b) keep the token's permission to this one repo; (c) set a calendar
   reminder to **rotate the token** if it's ever suspected leaked — rotating is a 5-minute
   job and the app keeps working for end users while you do it (reads are public).

2. **Passphrase strength.** The signing key is derived from the shared passphrase
   (`Itikaaf0`). If someone guesses it, they can sign malicious configs. It's moderate
   strength. *Recommendation:* if you ever suspect it's known outside the trusted admins,
   change it (this requires a rebuild, because the public key is baked in).

3. **`prayer-times.json` in the repo is NOT what the app reads** (the app reads its bundled
   copy). So repo tampering of that file is harmless *today*. **This changes in v60** when
   the timetable becomes remotely updatable — at that point the remote timetable **must be
   signed** exactly like the billboard config (planned — see §8).

4. **Dependence on free third-party APIs** (AlAdhan, Open-Meteo, FloatRates) for World
   Times. Not a *security* risk, but a *stability* one — see §6.

### Bottom line
The app is **safe for launch**. The headline risk (token extraction) cannot corrupt the two
critical features, and the one realistic content-injection vector (`quotes.json`) is low
severity and easy to close. None of this blocks the Play Store release.

---

## 6. Stability assessment — "will it break in a few months?"

You asked specifically whether the app could break due to the calendar, GitHub limits, or
the lack of a paid subscription. Direct answers:

| Concern | Verdict | Detail |
|---------|---------|--------|
| **End of 2026 — no prayer times for 2027?** | **Won't break** | v59 added a fallback: any future date reuses the **same month-and-day** times from the bundled year. Works forever, including **leap days** (29 Feb repeats 28 Feb). Times drift slightly from the true astronomical value over years, so you *should* still ship a fresh timetable annually — but the app will never blank out. |
| **GitHub repo "expires"?** | **Won't expire** | Public GitHub repos don't expire. They remain free and readable indefinitely. |
| **GitHub rate limits / bandwidth?** | **No realistic risk** | User reads use the public raw URL (effectively unlimited for a mosque-sized audience; each phone fetches config ~once per 30 min). The *token* (5,000 reqs/hour) is only used for admin writes and the occasional fresh-fetch — nowhere near the limit. |
| **Do you need to pay GitHub?** | **No** | Public repo = free hosting + **free unlimited GitHub Actions build minutes**. (Private repos get only 2,000 free Actions minutes/month — another reason the repo is public.) |
| **The access token expires?** | **Managed risk** | Fine-grained tokens can be set to expire (up to ~1 year) or to never expire. If it *does* expire, **end users are unaffected** (reads are public) — only **admin uploads** stop until you mint a new token and rebuild. Recommendation: note the token's expiry date; rotate before it lapses. |
| **Free third-party APIs disappear?** | **Degrades, doesn't crash** | Only **World Times** depends on them. Mecca/Medina prayer times are computed offline; currency has a 3-source fallback chain; weather simply shows nothing if down. Core prayer/alarm features don't touch these APIs at all. |

**Conclusion:** there are **no cliffs ahead**. The app will keep telling prayer times,
firing alarms, showing admin messages/posters, and running the Qibla/World-Times/currency
tools for the foreseeable future with **zero ongoing cost**.

---

## 7. Final pre-launch checklist (Android / Play Store)

You've done 12 days of testing and have Play Console permission. Before flipping to live:

- [x] **Core works offline** (prayer times + alarms) — verified.
- [x] **Timetable validated** — all 365 days correct, 24-hour format, Isha error fixed (v59).
- [x] **Perpetual operation** — future-year + leap-year fallback (v59).
- [ ] **Production signing.** The free GitHub Actions APK is signed with a *bundled dev
  keystore* — fine for sideload testing, **not** for the Play Store. For release, enable
  **Play App Signing** and generate a proper **upload key** (one-time). This is the single
  most important launch step to get right — once chosen, the signing identity is permanent.
- [ ] **One re-sign of the billboard config** after install (existing config must be saved
  once by an admin so it carries a valid signature — otherwise campaigns show nothing).
- [ ] **Store listing**: screenshots, description, privacy policy (state: "no personal data
  collected; donations handled externally").
- [ ] **Battery-optimisation guidance** in the listing/Help (Samsung users must set the app
  to "unrestricted" or alarms can be killed — already documented in-app).

Nothing on this list is a blocker beyond production signing, which is standard.

---

## 8. Planned next build (v60) — in-app prayer-times updater

Decided format: **CSV template** (lightweight, robust). Design:
1. App offers a **"Download template"** CSV with columns: `Date (DD/MM/YYYY), Fajr begins,
   Fajr jamaat, Shuruq, Dhuhr begins, Dhuhr jamaat, Asr begins, Asr jamaat, Maghrib,
   Isha begins, Isha jamaat`.
2. Admin fills it in Excel, "Save As CSV", and **imports it in the admin panel**.
3. App **validates every row** in-app (same checks used to audit the timetable: valid
   24-hour `HH:MM`, begins ≤ jamaat, chronological order) and **rejects bad files** with a
   clear message — so a malformed upload can never break the app.
4. Valid timetable is **Ed25519-signed** and uploaded to GitHub.
5. All phones **fetch + cache** the remote timetable, with this fallback order:
   **signed remote → bundled timetable → same-MM-DD rollover**. Always works offline.

This makes the timetable updatable without a rebuild while keeping the "works forever"
guarantee and adding tamper protection to the most important data in the app.

---

## 9. iOS release — what to expect

The codebase is Expo/React Native, so **most of the app ports to iOS with little change**:
prayer times, billboards, scrolling messages, Qibla, World Times, currency tools, donate —
all cross-platform.

**The one big gap is the alarm.** The Android adhan experience (full-screen lock-screen
takeover that plays the adhan over silent/Do-Not-Disturb) is **custom Android Java with no
direct iOS equivalent**. On iOS:
- Standard **notifications** can be delivered as *time-sensitive* (breaks through Focus), but
  iOS will **not** let an app play a long custom adhan over the lock screen on demand the way
  Android does.
- True alarm behaviour needs either **Critical Alerts** (requires a special Apple
  entitlement — prayer apps are sometimes approved, but it's an application process) or
  **AlarmKit** (only very recent iOS versions, limited).

**Practical plan for iOS:**
1. Build the app for iOS with full feature parity *except* the alarm, which becomes a
   time-sensitive notification with the adhan as the notification sound (short clips only).
2. Apply to Apple for the **Critical Alerts entitlement** in parallel; if granted, upgrade
   the iOS alarm to break through silent mode.
3. Expect **stricter App Store review** than Google Play (clear purpose + privacy answers
   help; we collect no personal data, which is in our favour).
4. iOS builds need a **Mac or EAS** (EAS uses paid credits) — unlike the free Android
   GitHub Actions path. Budget for that.

**Summary:** iOS is very doable and most features come for free, but **set expectations that
the lock-screen adhan alarm will be weaker on iOS unless/until Apple grants Critical
Alerts.** Everything else will feel the same.
