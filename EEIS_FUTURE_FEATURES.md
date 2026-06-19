# EEIS Prayer Times — Parked Feature Ideas

Ideas captured for future development. Not scheduled — picked up when prioritised.

---

## Multi-language scrolling ticker (green bar)

**Idea:** Let an admin author scrolling messages / quotes in **multiple scripts** — English,
Arabic, Urdu, Bengali — and have the green countdown bar cycle through them (e.g. the same
message shown in each language in turn, or separate per-language messages).

**Today's state (v94+):**
- The green bar marquee (`components/CountdownStrip.tsx`) scrolls a single line of text fully
  and already supports rich styling (colour, bold/italic, speed, flash) via `ActiveHeadline`.
- The **quote of the day** scrolls there (App.tsx → `activeHeadlines`), showing **Arabic (if the
  quote has an `arabic` field) + English**. Quotes are English-only at present.
- Admin **scrolling messages** (billboard config) are single-language free text.

**What a full multi-language version would need:**
1. **Data model:** extend the quote / scrolling-message shape to hold per-language variants,
   e.g. `{ en, ar, ur, bn }` instead of one `text`. Quotes already have an optional `arabic`
   field — generalise that to all four.
2. **Admin UI:** the CSV importer + in-app editor (`BillboardAdminScreen`) would need columns /
   fields per language, with validation (UTF-8 already handled for Arabic).
3. **Rendering:** the marquee would either (a) cycle each language as its own headline, or
   (b) concatenate scripts on one line. Right-to-left scripts (Arabic, Urdu) need correct RTL
   handling in `MarqueeText` (currently tuned for LTR). Font/line-height per script (the Help
   screen already bumps font size 1.3× for Urdu/Bengali — reuse that `scriptScale` idea).
4. **Language choice:** follow the app's existing language toggle, or rotate through all.

**Why parked:** the current need is just to read the full quote (Arabic + English), which v94
solves. Full per-language authoring is a larger data + admin + RTL-rendering change and is not
needed for launch.
