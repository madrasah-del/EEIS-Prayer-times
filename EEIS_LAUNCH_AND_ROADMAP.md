# EEIS Prayer Times — Play Store Launch, Updates & Roadmap

_Companion to `EEIS_BUILD_MANUAL.md`. Covers: going to full production on the Play Store now
that the 14-day closed test is passed; how easy ongoing updates are; and the roadmap to the
longer-term goals (especially the membership database and iOS)._

---

## PART A — Launch on the Play Store (production)

### Where you are
You completed Google's **closed-testing requirement** (20 testers × 14 days) and now have
**production access**. The app is feature-complete and the v77 audit found no launch blockers.

### The one thing that needs care: app signing
There are **two different signing keys** in play, and mixing them up is the only thing that can
go wrong here:

- **GitHub Actions APKs** are signed with a throwaway **dev keystore**. They are perfect for
  sideloading and testing, but **must never be uploaded to the Play Store** — Google would
  reject them (or worse, lock the listing to the wrong key).
- The **Play Store** build must be an **AAB** (Android App Bundle) signed with the **upload
  key** that your Play account expects, with **Play App Signing** enabled (Google holds the
  real signing key; you sign uploads with the upload key).

Because the original Play listing was created via **EAS**, the simplest and safest production
path is to **keep using EAS for production builds** — EAS manages the upload key for you.

### Production release — step by step
1. **Bump the version** (every release): `app.json` `versionCode` +1 and `versionName` if you
   show it; `constants/buildInfo.ts` for the in-app footer.
2. **Build the production AAB** (uses EAS credits — this is the one paid step, and it's only
   when you publish to the Store, not for normal testing):
   ```
   eas build --platform android --profile production
   ```
   This yields an `.aab` signed with the EAS-managed upload key.
3. **Play Console → your app → Production → Create new release** → upload the `.aab`.
4. Fill the release notes ("What's new"). Confirm the **store listing** is complete: short +
   full description, screenshots (phone), feature graphic, icon, category (Lifestyle), contact
   email, and a **privacy policy URL** (required — see below).
5. Complete the Play Console **declarations** (these are mandatory for an alarm app):
   - **Permissions**: justify `USE_EXACT_ALARM`/`SCHEDULE_EXACT_ALARM` (prayer-time accuracy),
     `USE_FULL_SCREEN_INTENT` (lock-screen adhan), `FOREGROUND_SERVICE` + the
     `mediaPlayback` FGS type, `RECEIVE_BOOT_COMPLETED`, location (Qibla).
   - **Data safety** form: declare what you collect. Today the app collects **no personal
     data** — say so honestly. (This changes when the membership DB ships — Part C.)
   - **Target audience / content rating** questionnaire.
6. **Roll out** — start at a staged % if you like, then 100%.
7. Users on the closed-test track move to the production version automatically.

### Privacy policy (required before production)
Host a short privacy policy (e.g. on `eeis.co.uk`) covering: the app stores settings only on the
device; fetches public content (prayer times, campaigns, quotes) from GitHub; uses location
**only** on-device for the Qibla compass (never uploaded); no accounts, no personal data, no
ads, no third-party tracking. Link it in the Play listing and in-app.

---

## PART B — How easy are ongoing updates? (very — three tiers)

This is the strongest part of the design. There are **three independent update channels**, from
instant to occasional:

### Tier 1 — Content (INSTANT, already live, zero build)
Prayer times, Jummah times, campaigns, scrolling messages, quotes, and the featured quote are
**signed files in the GitHub repo**. The admin edits them in-app and they reach every phone
within the cache window (minutes to a day) **with no app release at all**. This already works
today and covers the vast majority of day-to-day changes.

### Tier 2 — JavaScript bug fixes & tweaks (NEAR-INSTANT, via OTA — recommended to enable)
Most "short-to-medium-term tweaks" (UI, layout, logic, copy, new screens that don't add a
native module) are **pure JavaScript**. These can be pushed **over-the-air with EAS Update**
(`expo-updates`) — users get the fix on next app open, **no Play Store release, no review**.

> Status: `expo-updates` is currently **disabled** in the build (the CI workflow strips it for
> clean sideload APKs). To turn this on for production:
> 1. Keep `expo-updates` enabled in the **production** profile (don't strip it there).
> 2. Configure an EAS Update channel matched to the production release.
> 3. To ship a JS fix: `eas update --branch production --message "fix X"`. Done — live in
>    seconds to minutes for all users, automatically.
>
> Caveat: OTA can change JS/assets **only**. Anything that adds/changes a **native module or
> Java** (e.g. expo-secure-store, expo-sharing, the alarm engine) needs a Tier-3 store build.

### Tier 3 — Native changes (OCCASIONAL, full store build)
New native modules or Java changes require a new AAB through the Play Store (Part A). Android
then **auto-updates** the app for users (Play Store auto-update is on by default), usually
within a day. This is the only "slow" path and you'll rarely need it.

### Practical guidance
- Day-to-day org changes → **Tier 1** (admin, instant).
- Fixing a bug you find next week → almost always **Tier 2** (OTA) once enabled.
- Adding a brand-new capability that needs a native library → **Tier 3** (store), a few times a
  year at most.

**Versioning discipline:** always bump `versionCode` for a store build; OTA updates don't need a
versionCode bump but should carry a clear `--message`. Keep `buildInfo.ts` honest so the in-app
footer always tells you which build a user is on.

---

## PART C — Roadmap to the long-term objectives

### C1. Membership database (the big one) — keep it OUT of this app's architecture
The planned membership section will hold **personal/sensitive data** (names, DOB, addresses,
email, phone). This is a **fundamentally different security problem** and must **not** reuse the
public-GitHub content model.

**Hard rule:** PII must **never** live in the public repo or in any signed-JSON content file.
The current model protects the **integrity of public content**; it does nothing for the
**confidentiality of private data**.

Build it as a **separate, purpose-built backend**:
- Managed backend (e.g. Supabase / Firebase / managed Postgres) with **TLS + encryption at
  rest**.
- **Per-user authentication** (not the shared admin passphrase) + **role-based access**
  (member / volunteer / trustee).
- **Server-side secrets** (no tokens in the app), **audit logging**, and a **revocation** path.
- **UK GDPR / Data Protection Act 2018** compliance: lawful basis + consent, data minimisation,
  retention limits, right of access/erasure, breach process, a **named data controller**, and a
  **DPIA** before launch.
- When it ships, update the Play **Data safety** form to declare the personal data collected.

Principle: **proportionate now, purpose-built later.** Don't bolt PII onto the content layer.

### C2. iOS app
One codebase already targets iOS. Budget for: an **Apple Developer account ($99/yr)**, a
Mac/EAS build pipeline, App Store review, and an **iOS-specific alarm path** — iOS can't run the
Android-style foreground-service adhan, so use rich notifications (with **Critical Alerts** as an
approval-gated upgrade for the lock-screen adhan). Set expectations that the lock-screen adhan is
softer on iOS than Android. All the content/signing infrastructure is reused as-is.

### C3. Reliability & polish (short-term, JS-only → OTA-able)
- Reboot alarm rescheduling (`RECEIVE_BOOT_COMPLETED` → reschedule on boot).
- Battery-friendly tick (update the heavy state on the minute, keep the seconds clock cheap).
- Add explicit timeouts to the remaining World Times fetches.
- Enforce campaign `imageHash` (already carried in the signed config) to fully close image
  swaps.

### C4. Build/release hardening
- **Enable EAS Update (Tier 2)** so bug fixes ship without store round-trips.
- Optionally **automate the production AAB + Play upload** via fastlane/`supply` + the Play
  Developer API, so a tagged release publishes to the Store hands-free.
- Consider a per-admin **multi-signer** scheme (each admin their own key, baked allow-list) if
  the volunteer team grows and you want authenticated (not self-declared) attribution.

---

## PART D — Lessons learned (engineering)

1. **Reliability lives in the native layer.** The adhan only works because it's a foreground
   service on the ALARM stream — every JS-only attempt was defeated by Doze/DND/OEM killers.
2. **Sign content, don't trust the transport.** Making the GitHub repo public was fine because
   integrity comes from Ed25519 signatures, not repo privacy. A leaked token can't deface the
   app.
3. **Always ship a bundled fallback.** Prayer times, quotes, Jummah — each degrades to a baked
   default, so the app is never blank and never wrong, even offline or with a bad upload.
4. **Android's `adjustsFontSizeToFit` is a trap** inside flex rows on re-layout — prefer fixed
   sizes that are known to fit.
5. **Don't push big payloads through `Share.share`** — Android's text-share intent chokes
   (~178 KB froze the app). Share a file instead.
6. **`pagingEnabled` needs integer page widths** — fractional layout widths (Samsung) drift and
   leave pages stuck between slides; use `snapToInterval` with rounded widths.
7. **expo-file-system `readAsStringAsync` crashes on SDK 54** — read via XHR+FileReader; the
   modern `File` API is fine for writing.
8. **Keep one source of truth.** `app.config.js` derives both the live and TEST variants from
   `app.json`; content is channel-routed in `channel.ts`. No forked configs.
9. **Local compile gate before every build.** `tsc --noEmit` + a Java non-ASCII byte-scan
   caught issues that would otherwise have cost 10-minute cloud-build cycles.
10. **Free CI + public Releases** give unlimited free test builds with permanent, token-free
    download links — no paid build minutes for day-to-day testing.

---

## Quick-start: "I just want to publish a fix"

- **Org content change** (times/campaign/quote): do it in the **admin panel** — done, no build.
- **Small JS bug** (once OTA is enabled): `eas update --branch production -m "fix"` — live in
  minutes.
- **Native change**: bump versionCode → `eas build --profile production` → upload AAB to Play
  Console → roll out → Android auto-updates users.

---

## GO-LIVE RUNBOOK (do these once, in order)

The repo is already OTA-ready: `app.json` has the EAS update URL + `runtimeVersion` (appVersion
policy), `expo-updates` is installed, and `eas.json` has a `production` profile on the
`production` channel. The free GitHub APK builds strip updates (sideload only); the **EAS
production build keeps updates enabled**, so production users receive OTA automatically.

### Step 0 — one-time secret (enables the one-click OTA button)
1. expo.dev → Account → **Settings → Access tokens** → create a token (copy it).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `EXPO_TOKEN` = that token. (Used by `.github/workflows/publish-ota.yml`.)

### Step 1 — build & ship the production app (on your Mac, logged into EAS as `eeis`)
```
eas login                                   # if not already
eas build --platform android --profile production    # builds an AAB with OTA enabled (uses credits)
```
Then either auto-submit or upload manually:
```
eas submit --platform android --profile production   # needs google-play-key.json (see eas.json)
# — OR — Play Console → Production → Create release → upload the .aab
```
Complete the listing/declarations/privacy policy (see Part A), then **roll out to 100%**.

> Keep `versionName` at **1.0.0** for the foreseeable future. The runtimeVersion policy is
> `appVersion`, so as long as 1.0.0 stays put, every OTA update reaches all production users.
> Bump `versionName` ONLY when you ship a new **native** build (it starts a fresh OTA lineage).

### Step 2 — from now on, fixing a live bug (the goal: users do nothing)
- **JS/UI/logic fix** (the common case): commit the fix to `main`, then
  GitHub → **Actions → "Publish OTA Update" → Run workflow** → type what it fixes → Run.
  Every production user silently downloads it the next time they open the app. No reinstall,
  no Play review, no action from them. (Or locally: `eas update --branch production -m "fix"`.)
- **Content** (prayer times / campaign / quote): just use the **admin panel** — already instant.
- **Native change** (new native module / Java): repeat **Step 1** (new AAB → Play → auto-update).

### How "automatic, behind the scenes" actually works
`expo-updates` checks EAS on app launch; if a newer compatible JS bundle exists it downloads it
in the background and applies it on the **next** launch (`fallbackToCacheTimeout: 0` = never
blocks startup). So a user gets the fix within one or two app opens — invisibly. There is no
prompt and nothing to tap.

### Safety notes
- The OTA workflow runs `tsc` before publishing, so broken code can't go out.
- OTA is **manual (one click)** by design — you decide when a fix is ready for everyone. If you
  later want truly hands-off auto-publish on every push, change `publish-ota.yml` trigger from
  `workflow_dispatch` to `push: branches: [main]` (only do this once you trust your pre-push
  testing — it sends every commit to all users immediately).
- To undo a bad OTA: publish a corrected update, or `eas update:roll-back-to-embedded` to revert
  users to the JS that shipped in their installed build.
