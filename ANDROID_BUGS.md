# Android Bug Tracker

Standing log for Android issues reported during beta testing, kept separate from active work so
nothing gets lost while iOS is the current focus. Each entry: symptom, root cause (if diagnosed),
proposed fix, status. Fix these one at a time, each shipped via the **free GitHub Actions APK
build** (not EAS) once picked up.

---

## 1. Permission choices don't persist — wizard re-asks after granting, or nags forever after declining

**Status:** FIXED v119 (17 Jul 2026)

**Fix shipped:** New `data/permissionState.ts` tracks each permission's "asked" state (per
permission, not one global flag). `shouldShowPermissionsWizard()` now shows the wizard only for a
permission that is not granted AND not yet asked; `PermissionsWizard` marks each step asked as the
user advances (grant OR skip), so it never re-loops. Old installs that completed the previous
wizard are migrated (all marked asked) so they never see it again. Added an "App Permissions"
section in Alerts (live status + re-grant per permission) as the revisit path, and a once-a-month
reminder (opt-out) if a checkable permission is definitively off. No Java changes.

--- original diagnosis (kept for reference) ---

**Symptom (reported by beta tester + user's own device):** Granting a permission (e.g.
Notifications) once, closing the app, and reopening it sometimes re-asks for that same permission.
Separately, if a user declines a permission (e.g. taps "Skip for now"), the app asks again every
single time it's opened — there's no way to stop the nagging short of granting it, and no way to
review/change the choice later from within the app.

**Root cause:** `components/PermissionsWizard.tsx` + its `shouldShowPermissionsWizard()` helper
track completion with a single binary flag (`@eeis_perms_wizard_done_v2`), not per-permission
state. That flag is only set once the user reaches "Finish" on every step. If any single step is
skipped/declined, the flag never gets set — so the ENTIRE wizard (including permissions already
granted) re-shows on every subsequent app open, indefinitely. There is also no "Manage
Permissions" UI anywhere in the app to let a user revisit a declined permission later.

**Proposed fix:**
1. Replace the single flag with a per-permission record, e.g. `@eeis_perm_state_v1`:
   `{ notifications, exactAlarm, fullScreenIntent, batteryOpt }`, each
   `{ lastKnown: 'granted'|'denied'|'unknown', dontRemindAgain?: boolean }`.
2. `shouldShowPermissionsWizard()` should only show the wizard for permissions whose live OS
   status isn't granted AND whose record doesn't have `dontRemindAgain` — record each step's
   outcome immediately (not just on final "Finish"), so partial completion doesn't reopen the
   whole flow.
3. Add a "Manage Permissions" section to `components/AlertsScreen.tsx`: live status pill per
   permission (re-checked on screen focus, not cached) + an "Open Settings" button per row, reusing
   the existing native intent launchers already in `hooks/useNotificationScheduler.ts`
   (`checkExactAlarmPermission`, `promptBatteryOptimisationOnce`, `promptFullScreenIntentOnce`) —
   don't recreate these.
4. Add a monthly reminder (per user's preference): if a permission is still denied and not
   `dontRemindAgain`, show one dismissible reminder at most once per calendar month, with a
   "Don't ask again" option that sets `dontRemindAgain` for the currently-denied permissions.

**Note:** iOS has the same class of issue in miniature (only the Notifications permission
applies there) — a minimal always-visible status row + "Open Settings" button was added to
`AlertsScreen.tsx` for iOS in the v118 round (see `constants/buildInfo.ts` history). Android needs
the fuller multi-permission version described above.

---

## 2. Campaign re-shows on every app open (FIXED v119)

**Status:** Fixed in v119 (17 Jul 2026)

**Symptom (user, live build):** A campaign set for a daily prayer (e.g. Dhuhr) re-appeared every
single time the app was opened after that prayer — 3+ times in a row — instead of showing once and
then not again until the next occurrence.

**Root cause:** The only "show once per occurrence" guard (`@eeis_catchup_seen`) gated just the
app-open catch-up path (`runPrayerCatchUp`). But a campaign is also triggered by the native
alarm-stop watcher, notification taps, and the flash-screen dismiss deep-link — and those paths had
only an in-memory 5-second dedupe, no persistent per-occurrence record. On Android, each app open
re-showed the native alarm, whose dismissal re-fired the campaign via the alarm-stop watcher, so it
reappeared every time.

**Fix (App.tsx):** Added `presentCampaignOnce(prayerKey, slides, campaignId)` backed by a
persistent `@eeis_campaign_shown_v1` record keyed by `${dateKey}_${prayer}`. Every display path
(`showBillboardForPrayer` + the cold-launch pending-config effect) now funnels through it, so a
campaign shows at most once per prayer per day and survives app restarts. Admin test-preview
deliberately bypasses it (admins preview on demand). Cross-platform (also benefits iOS).

<!-- Add new entries above this line as they're reported. -->
