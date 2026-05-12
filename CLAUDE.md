# EEIS Prayer Times App — Project Documentation

## Overview

Mobile app for the **Epsom & Ewell Islamic Society (EEIS)**.  
Cross-platform iOS + Android, built with **Expo (React Native)** + TypeScript.  
Published via **EAS Build** to Apple App Store and Google Play Store.

## App Identity

| Field | Value |
|-------|-------|
| App name | EEIS Prayer Times |
| Organisation | Epsom & Ewell Islamic Society |
| Bundle ID (iOS) | com.eeis.prayertimes |
| Package name (Android) | com.eeis.prayertimes |
| Version | 1.0.0 |

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Expo SDK | 54.x | Framework |
| React Native | 0.81.x | UI runtime |
| TypeScript | 5.x | Language |
| EAS CLI | latest | Cloud builds + store submission |
| @expo-google-fonts/poppins | latest | Poppins 400/500/600/700/800 |
| react-native-safe-area-context | latest | Safe area insets |

## Architecture

```
eeis-app/
├── App.tsx                       # Root component — main prayer times screen
├── app.json                      # Expo config (name, icons, bundle ID)
├── eas.json                      # EAS build profiles (preview = APK, production = AAB)
├── assets/
│   └── logo.png                  # EEIS logo (used in Header badge)
├── constants/
│   └── theme.ts                  # Brand colours (deepBlue, maroonRed, freshGreen, etc.)
├── data/
│   └── prayer-times.json         # Full 2026 prayer times keyed by YYYY-MM-DD
├── components/
│   ├── Header.tsx                # Logo badge (left) + live HH:MM clock (right)
│   ├── DateTimeBar.tsx           # Tappable date bar — Gregorian + Hijri, opens calendar
│   ├── CountdownStrip.tsx        # Green strip — countdown to next prayer jamaat
│   ├── PrayerRow.tsx             # Single prayer row (flex:1 equal height)
│   ├── DonateButton.tsx          # Maroon donate button + confirmation modal
│   └── CalendarModal.tsx         # Month calendar picker with swipe + Friday highlights
├── hooks/
│   └── usePrayerTimes.ts         # Real-time state: now, next prayer, hijri, BST, Friday
└── CLAUDE.md                     # This file
```

## Prayer Times Data Format

File: `data/prayer-times.json`

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

Arrays are `[begins, jamaat]`. Maghrib and Shuruq are single strings (jamaat only / sunrise only).  
Times are **local UK time** (BST summer, GMT winter). BST detection uses last-Sunday-of-March/October algorithm.

## Brand Colours (constants/theme.ts)

| Token | Hex | Usage |
|-------|-----|-------|
| `deepBlue` | `#0B5EA8` | Date bar bg, nav arrows, cancel button |
| `blueDeep` | `#063968` | Date bar bg, logo badge border |
| `maroonRed` | `#8B1A2E` | Prayer names, Friday highlights, donate |
| `freshGreen` | `#4CAF50` | Clock, countdown strip bg, today ring |
| `bgScreen` | `#F5F5F5` | Screen background |
| `ink` | `#1A1A1A` | Primary text |
| `inkMute` | `#6B6B6B` | Labels, hints, disabled days |

## Key Behaviours

- **Auto-advance**: On launch, if past Isha Jama'at, shows tomorrow's times automatically
- **Swipe navigation**: Left = next day, Right = previous day (animated slide)
- **Calendar picker**: Tap date bar → month grid; swipe months; tap Friday dates
- **Hijri date**: Advances at Maghrib (not midnight); uses JD offset -1525 algorithm
- **Friday / Jummah**: Dhuhr row becomes JUMMAH with two congregation times (BST-aware)
- **Jama'at changed**: Red underline bar on Fajr/Dhuhr/Asr/Isha jamaat if different from previous day
- **Countdown**: Shows when viewing today or auto-advanced tomorrow

## Developer Accounts

- **Apple Developer Program** — $99/year — developer.apple.com/programs/enroll
- **Google Play Console** — $25 one-time — play.google.com/console

## Next Features (Phase 2)

- Prayer alerts & sounds screen (notifications + adhan audio per prayer)
- App icon and splash screen assets
- iOS build + App Store submission
- Google Play Store submission
