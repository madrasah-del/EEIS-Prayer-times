# iOS App Store launch — step-by-step checklist

App: **EEIS Prayer Times** · Bundle ID `com.eeis.prayertimes` · ASC App ID **6781048296**
Latest build submitted to TestFlight: **build 23 (v101)** — tested OK.

---

## ⚠️ READ FIRST — the developer/seller name ("JJ Productions")
Unlike Google Play (where you freely type a developer name), **Apple shows the name of your
Apple Developer Program account**:
- **Individual account → your real legal name is shown.** There is no pseudonym option.
- **Organization account → the registered company name is shown** (requires a D-U-N-S number for
  a real registered "JJ Productions" business).

👉 **Check yours:** App Store Connect → (top-right) **Account / Membership** → see the membership
type and name. If it shows your personal name and you need "JJ Productions", you must enrol the
account as an **Organization** before/instead of launching — this is an Apple account change, not
a publishing setting, and can take days. Decide this first.

*(The app listing, privacy policy and code already say "JJ Productions / EEIS" — only the
account-level seller name is the constraint.)*

---

## A. Host the Privacy Policy (required by Apple)
Pick ONE:
1. **Best:** put `docs/privacy.html` on the EEIS website → link `https://eeis.co.uk/privacy`.
2. **Free (GitHub Pages):** if the app repo is public, enable Settings → Pages → Branch `main`
   /`docs` → link becomes `https://<owner>.github.io/<repo>/privacy.html`. (Private repos need a
   paid GitHub plan for Pages.)
3. Any static host (Netlify drop, etc.).
Confirm the link opens in a browser before you submit, and that `info@eeis.co.uk` is monitored
(or change it in `docs/privacy.html`).

## B. Screenshots
Capture 4–6 iPhone screenshots from the running app (see `APP_STORE_LISTING.md` → Screenshots).

## C. Listing text
All ready to paste from **`APP_STORE_LISTING.md`** (name, subtitle, description, keywords,
support URL, reviewer notes).

---

## D. In App Store Connect — do these in order
Sign in: **https://appstoreconnect.apple.com** → **My Apps → EEIS Prayer Times**

1. **App Information** → set **Category = Lifestyle**, **Content Rights**, and paste the
   **Privacy Policy URL** from step A.
2. **Pricing and Availability** → **Free**; choose territories (UK only, or worldwide).
3. **App Privacy** → **"Data is NOT collected"** → Publish. (Details in `APP_STORE_LISTING.md`.)
4. **App Store** tab → **(+) Version or Platform → iOS → 1.0**.
5. Paste **Description, Keywords, Subtitle, Promotional text, Support URL, What's New**.
6. Upload **Screenshots**.
7. **Build** → **Select** build **23 (v101)** (must show "Ready to Submit"; if it says "Missing
   Compliance", answer the encryption question = No).
8. **Age rating** → answer all **None** → 4+.
9. **App Review Information** → paste the **Reviewer notes**; tick "Sign-in not required".
10. **Version Release** → choose **Automatically release** (or Manual if you want to press the
    button yourself after approval).
11. Click **Add for Review → Submit**.
12. Answer **Export compliance = No**, **IDFA = No**, **content rights = Yes**.

## E. After submitting
- Status goes **Waiting for Review → In Review → (Approved | Rejected)**, usually 1–3 days.
- **Rejected?** Apple writes the exact reason in the Resolution Center → fix → resubmit (no new
  build needed unless it's a code issue).
- **Approved + automatic release** → it goes live on the App Store within a few hours.

## F. Repeat for future updates
Build a new version with `eas build --platform ios --profile production` →
`eas submit` (or it auto-submits via our watcher) → in App Store Connect create a new **version**,
attach the new build, fill **What's New**, submit for review.

---

### Files prepared for you
- `docs/privacy.html` — hostable privacy policy (JJ Productions / EEIS, no personal name)
- `PRIVACY_POLICY.md` — same text in markdown
- `APP_STORE_LISTING.md` — all listing copy + privacy answers + reviewer notes + screenshot list
- `IOS_LAUNCH_CHECKLIST.md` — this file
