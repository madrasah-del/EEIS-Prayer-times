# EEIS App — Billboard Admin Guide

Billboards are organisation-controlled announcement slides that appear automatically in the EEIS Prayer Times app after a prayer notification is tapped. They are ideal for Eid announcements, fundraising drives, event notices, and urgent community updates.

---

## How It Works

1. A worshipper taps a prayer notification.
2. The app checks a config file on GitHub to see if any campaigns are active for that prayer on today's date.
3. If a matching campaign is found, a full-screen slideshow appears inside the app.
4. The worshipper can swipe through slides or close with the ✕ button.

**No app update is required.** You edit the config file on GitHub and all users see the change within minutes.

---

## Config File Location

The config is hosted at:
```
https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/billboard-config.json
```

To edit it:
1. Go to [github.com/madrasah-del/EEIS-Prayer-times](https://github.com/madrasah-del/EEIS-Prayer-times)
2. Open `billboard-config.json`
3. Click the pencil (✏) icon to edit
4. Make your changes and click **Commit changes**

Changes go live within a few minutes (after GitHub's CDN cache refreshes).

---

## Config File Format

```json
{
  "version": 1,
  "campaigns": [
    {
      "id": "eid-2026",
      "active": true,
      "startDate": "2026-03-28",
      "endDate":   "2026-04-05",
      "prayers": ["fajr", "maghrib", "isha"],
      "displayDurationSec": 12,
      "slides": [
        {
          "id":       "eid-slide-1",
          "title":    "Eid Mubarak!",
          "body":     "May Allah accept your fasts and prayers.",
          "imageUrl": "https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/billboards/eid-2026.jpg",
          "ctaLabel": "Donate Online",
          "ctaUrl":   "https://eeis.co.uk/donate"
        }
      ]
    }
  ]
}
```

---

## Field Reference

### Campaign fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Use lowercase-hyphen format, e.g. `ramadan-2027`. |
| `active` | Yes | `true` = campaign runs. Set to `false` to disable without deleting. |
| `startDate` | Yes | First date the campaign shows. Format: `YYYY-MM-DD` (inclusive). |
| `endDate` | Yes | Last date the campaign shows. Format: `YYYY-MM-DD` (inclusive). |
| `prayers` | Yes | Which prayers trigger this campaign. Options: `"fajr"`, `"shuruq"`, `"dhuhr"`, `"asr"`, `"maghrib"`, `"isha"`. Use `["fajr","maghrib","isha"]` for multiple. |
| `displayDurationSec` | No | How long each slide is visible before auto-advancing. Default: 8 seconds. For urgent notices set lower (e.g. 5). For complex slides set higher (e.g. 15). |
| `slides` | Yes | Array of one or more slides (see below). |

### Slide fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier within the campaign, e.g. `eid-slide-1`. |
| `title` | Yes | Large heading text shown on the slide. |
| `body` | No | Supporting text below the title. |
| `imageUrl` | No | Full URL to a poster image. See Image Hosting below. |
| `bgColor` | No | Background colour (hex, e.g. `"#0B5EA8"`) used when no image. Defaults to EEIS blue. |
| `ctaLabel` | No | Text for the call-to-action button (e.g. `"Donate Online"`). Only shown if `ctaUrl` is also set. |
| `ctaUrl` | No | URL or EEIS deep link the button opens. Use `"https://..."` for external links or `"eeis://donate"` for the in-app donate screen. |

---

## Image Hosting

### Option 1 — GitHub (recommended, free)

1. In the GitHub repo, create a folder called `billboards/` if it does not exist.
2. Upload your image file (e.g. `eid-2026.jpg`) to that folder.
3. After uploading, click the file, then click **Raw** to get the URL. It will look like:
   ```
   https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/billboards/eid-2026.jpg
   ```
4. Paste that URL into the `imageUrl` field of your slide.

### Option 2 — Any public image URL

Any image accessible via `https://` without authentication will work. Hostinger, ImgBB, Cloudinary, etc. all work.

### Recommended image sizes

| Format | Size | Notes |
|--------|------|-------|
| Portrait poster | 1080 × 1920 px | Fills the full phone screen on all sizes |
| Landscape banner | 1080 × 600 px | Good for simple text banners |
| File size | Under 200 KB | Loads quickly on mobile data |
| Format | JPEG or PNG | Both work; JPEG is smaller for photos |

---

## Scheduling Examples

### Show slides for Eid only at Fajr and Maghrib for one week

```json
{
  "id": "eid-2027",
  "active": true,
  "startDate": "2027-03-20",
  "endDate":   "2027-03-27",
  "prayers": ["fajr", "maghrib"],
  "displayDurationSec": 10,
  "slides": [...]
}
```

### Show a fundraising slide at every prayer for a whole month

```json
{
  "id": "fundraiser-may-2027",
  "active": true,
  "startDate": "2027-05-01",
  "endDate":   "2027-05-31",
  "prayers": ["fajr", "shuruq", "dhuhr", "asr", "maghrib", "isha"],
  "displayDurationSec": 8,
  "slides": [...]
}
```

### Run two campaigns at the same time

Simply add both as separate objects in the `campaigns` array. If both match the same prayer on the same date, both sets of slides will be shown in sequence.

### Disable a campaign without deleting it

Set `"active": false`. The campaign stays in the file for future reference but will not show.

---

## How to Test

To test without waiting for a real prayer time:

1. Edit `billboard-config.json` on GitHub.
2. Set `startDate` and `endDate` to today's date (e.g. `"2026-05-16"`).
3. Set `active` to `true`.
4. Add a test slide with a title like `"TEST — Admin billboard check"`.
5. Open the EEIS Prayer Times app.
6. Tap any prayer notification (or use the Test Alarm button and tap the notification when it fires).
7. The billboard slideshow should appear.
8. Once tested, set `active` to `false` or change the dates so it no longer shows.

**Note:** The app caches the config once per day. To force an immediate refresh during testing, close and reopen the app.

---

## Multiple Slides Within One Campaign

Add multiple objects to the `slides` array. The slideshow will auto-advance through them at the `displayDurationSec` interval, then loop back to the first slide.

```json
"slides": [
  {
    "id": "slide-1",
    "title": "Eid Mubarak!",
    "body":  "May Allah accept your prayers.",
    "imageUrl": "https://..."
  },
  {
    "id": "slide-2",
    "title": "Donate this Eid",
    "body":  "Help us maintain the mosque for our community.",
    "ctaLabel": "Donate Online",
    "ctaUrl":   "https://eeis.co.uk/donate"
  }
]
```

---

## Deep Links for CTA Buttons

Use these EEIS deep links in `ctaUrl` to open screens inside the app:

| Deep link | Action |
|-----------|--------|
| `eeis://donate` | Open the Donate screen (bank transfer / Gift Aid) |
| `eeis://qibla` | Open the Qibla compass |
| `eeis://calendar` | Open the prayer times calendar |
| `https://...` | Open any external website in the browser |

---

## Questions / Support

Contact the app developer or email **info@eeis.co.uk** for assistance.
