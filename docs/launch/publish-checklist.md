# v1 publish checklist: pages and URLs Joshua must publish

v1 decisions (RBChedda, Nov 17 2026): launch **free with the paywall hidden**, **iPhone only**.

Until each value below is set, the app falls back to an obvious placeholder:
`https://birdbrain.invalid/TODO_PUBLISH/<page>` (the `.invalid` TLD never resolves) or
`TODO_PUBLISH@birdbrain.invalid`. `app.config.ts` prints a
`[birdbrain] ... TODO_PUBLISH placeholder links: ...` warning on `expo start` and on every EAS
build while any of them is unset (it says `PRODUCTION BUILD` on the production profile).
**Do not submit a build that prints that warning.**

Release check: `rg -n TODO_PUBLISH app/src/lib/env.ts` shows the fallbacks; the build log warning
shows which env vars are still missing.

## 1. Pages and addresses to publish

| # | What | Needs to say / do | App env var (EAS env, production) | Also used in |
|---|---|---|---|---|
| 1 | **Privacy Policy page** (public https) | What BirdBrain collects: email/account, location while the app is open (When In Use), posts, diary entries and private photos, crew data, consent records; posts go public only after the delay; account deletion in Settings; no tracking/ads; support contact. Legal review is on hold (Joshua's call). | `EXPO_PUBLIC_PRIVACY_URL` | App Store Connect → App Privacy → Privacy Policy URL; web/share `config.js` `privacyUrl` |
| 2 | **Terms of Service page** (public https) | Full ToS matching in-app `TERMS_VERSION` `2026-11-10` (the in-app "Maps, Data and Your Responsibility" section is a subset). | `EXPO_PUBLIC_TERMS_URL` | App Store Connect → License Agreement (optional, else Apple's standard EULA); web/share `config.js` `termsUrl` |
| 3 | **Support page** (public https) | How to contact support, how to delete your account, FAQ (optional). Apple requires a working Support URL. | `EXPO_PUBLIC_SUPPORT_URL` | App Store Connect → App Information → **Support URL** (required) |
| 4 | **Support inbox** (a real mailbox someone reads) | Receives support mail and, if you use mailto for #5, map error reports. | `EXPO_PUBLIC_SUPPORT_EMAIL` | Shown in Settings → Help; listed on the Support page; App Review contact |
| 5 | **Map error report** (form URL or `mailto:`) | Lets users report a wrong boundary, access label or season. A form URL gets `?place=<id>&name=<name>` appended; `mailto:you@domain` gets a prefilled subject and body. Simplest: `mailto:` + the support inbox. | `EXPO_PUBLIC_MAP_ERROR_URL` | Map → place sheet → "Report a map error" |
| 6 | **Marketing / app home URL** (optional) | Landing page. | none (app does not link it) | App Store Connect Marketing URL (optional); web/share `config.js` `appUrl` (replaces the old hard-coded `birdbrain.app`, whose ownership was not verified) |

Any static host works (GitHub Pages, Netlify, Cloudflare Pages, the web/share host). Use https.

## 2. Where each one is configured

- **App:** `app/src/lib/env.ts` → `legal` (single spot). Values come only from the `EXPO_PUBLIC_*`
  vars above; set them as **EAS environment variables** for the `production` environment (Expo
  dashboard → Project → Environment variables, or `eas env:create`). They are public (inlined in the
  bundle), so plain-text visibility is fine; they are not secrets. Locally, put them in `app/.env`
  (see `.env.example`).
  - Used by: `components/LegalLinks.tsx` (sign-in, age gate, Settings), `components/TermsContent.tsx`
    (onboarding consent, /terms), `entitlements/Gated.tsx` (paywall sheet, hidden in v1),
    `app/(tabs)/index.tsx` (map error report), `components/profile/AccountSettings.tsx`
    (Settings → Help → Contact support: the support page, else a mail to the support inbox).
- **Build warning:** `app/app.config.ts` → `unsetLaunchLinkVars()`.
- **Share viewer (flag off for v1):** `web/share/config.js` on the host (`appUrl`, `privacyUrl`,
  `termsUrl`; see `config.example.js`). Unset/TODO values leave the footer links inert/hidden.
- **App Store Connect (manual):** Privacy Policy URL, Support URL, optional Marketing URL, App Review
  contact email.

## 3. Also needed for v1 (not URLs, listed so nothing is missed)

- Paywall stays hidden: do **not** set `EXPO_PUBLIC_FLAG_PAYWALL` in the production EAS env.
- App Privacy labels: no "Purchases" while the paywall is hidden.
- iPhone-only: `supportsTablet: false` is set; upload iPhone 6.9" and 6.5" screenshots only.
- Confirm the bundle ID `com.rbchedda.birdbrain` before creating the App Store Connect record.
