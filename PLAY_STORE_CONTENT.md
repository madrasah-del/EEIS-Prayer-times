# Play Console "App content" — ready-to-paste answers

Use these while you wait for production access. All are accurate for EEIS Prayer Times as of
v80. (Internal helper — not user-facing.)

## Privacy policy URL
Host `PRIVACY_POLICY.md` and paste its URL into Play Console → App content → Privacy policy.
- Easiest public URL (no hosting needed): the GitHub copy —
  `https://github.com/madrasah-del/EEIS-Prayer-times/blob/main/PRIVACY_POLICY.md`
- Or host it on eeis.co.uk (nicer, recommended long-term).
- Remember to fill in the contact email placeholder first.

## Data safety form (Play Console → App content → Data safety)
- **Does your app collect or share any of the required user data types?** → **No.**
  (Settings stay on-device; location is used on-device only for Qibla and never transmitted —
  under Google's definitions that is not "collection" or "sharing".)
- Data encrypted in transit: N/A (no user data collected).
- Users can request data deletion: N/A (no data collected).
- Result: the listing will show **"No data collected / No data shared."**

## Permission declarations (Play Console will ask about these "sensitive" permissions)
- **Exact alarm (SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM):**
  "EEIS Prayer Times is an alarm/clock app. It fires the adhan (call to prayer) at the exact,
  minute-precise prayer times; an inexact alarm would defeat the app's core purpose."
- **Full-screen intent (USE_FULL_SCREEN_INTENT):**
  "Shows the full-screen adhan alarm on the lock screen at prayer time, exactly like a clock
  app's alarm, so the user sees it and can stop or snooze it."
- **Foreground service (type: mediaPlayback):**
  "Plays the adhan reliably at the scheduled prayer time, including when the device is idle or
  the screen is locked."
- **Location (ACCESS_FINE/COARSE_LOCATION):**
  "Used only on-device to orient the Qibla compass toward Mecca. Location is never transmitted
  or stored. Optional — the app works without it."

## Content rating questionnaire
Category: **Utility / Reference / Religion**. Answer "No" to all violence/sexual/gambling/
substance questions. Result will be **Everyone / PEGI 3**.

## Store listing essentials (if not already filled from closed testing)
- **App name:** EEIS Prayer Times
- **Short description (≤80 chars):**
  "Accurate prayer times, adhan alarms, Qibla compass & updates for Epsom & Ewell."
- **Full description (suggested):**
  "EEIS Prayer Times is the official app of the Epsom & Ewell Islamic Society. It shows accurate
  daily prayer begin and jama'at times, with reliable adhan alarms that work even when your
  phone is locked or on silent. Features: full-screen adhan alarm with optional screen flash,
  torch and vibrate; Jummah times; a Qibla compass; daily Quran and Hadith reminders; a Hijri
  calendar; world prayer times, weather and currency for major cities; and community
  announcements from the mosque. Prayer times, announcements and quotes are kept up to date by
  the Society — no app update needed. No ads, no tracking, no account required."
- **Category:** Lifestyle (or Tools). **Tags:** prayer times, adhan, Qibla, Islam.
- **Contact email:** [INSERT EEIS CONTACT EMAIL]

## "What's new" for this first production release (v80 / versionCode 80)
"First public release. Accurate prayer times and reliable adhan alarms, Qibla compass, daily
Quran & Hadith reminders, world times, and live community announcements."
