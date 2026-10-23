# Release checklist: App Store submission, target **Mon Dec 21, 2026**

Owner: RBChedda. Tick these off in order. Anything that creates an Expo or Apple resource is done by a human, on purpose.

## Now → Nov 20: accounts and identifiers
- [ ] Apple Developer Program membership active (Organization if publishing as a company).
- [ ] **Confirm the bundle id.** `app.config.ts` uses the placeholder `com.rbchedda.birdbrain` (override: `BIRDBRAIN_IOS_BUNDLE_ID`). It can't change after the first App Store Connect record.
- [ ] `eas init` to link or create the EAS project (adds `extra.eas.projectId` to the app config). Commit that id.
- [ ] Create the App Store Connect app record (name "BirdBrain", primary language, bundle id, SKU).
- [ ] `eas credentials`: distribution certificate and provisioning profile (let EAS manage them).
- [ ] `EXPO_TOKEN` goes only in CI secrets and local env. Never commit it.

- [ ] **Android package.** `android.package` reuses the same placeholder (`com.rbchedda.birdbrain`, same override). Fine for now; confirm before the first Play Console listing, since it can't change after that either.
- [ ] **Hosted Supabase Auth redirect URLs.** In the Supabase dashboard → Authentication → URL Configuration, add `birdbrain://**` and `exp://**` to Redirect URLs (they're empty on the hosted project; the dev token lacks `auth_config_write`, so this is a manual step). Needed for magic-link / OAuth returns in TestFlight builds.

## Feature flags (set per profile in `eas.json` → `build.<profile>.env`; production leaves `EXPO_PUBLIC_PURCHASES_PROVIDER` unset → Unavailable until RevenueCat, and a test enforces it never says mock)
- [ ] `EXPO_PUBLIC_PURCHASES_PROVIDER=revenuecat` for production once RevenueCat exists (BLOCKED: no account). Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (public SDK key) as an EAS env var.
- [ ] RevenueCat: products `weekend_pass` (non-renewing) and `season_pass_yearly` (auto-renew + intro offer) created in App Store Connect and attached to the `pro` entitlement. Paid Apps agreement, tax and banking done.
- [ ] `EXPO_PUBLIC_FLAG_APPLE_SIGN_IN=1` only after the Apple sign-in capability is on for the bundle id **and** the Supabase Apple provider is configured. If any third-party sign-in ships, Guideline 4.8 requires Apple sign-in too.
- [ ] Supabase: production URL and anon/publishable key only. **The service_role key never goes in the app.** `noServiceRole.test.ts` enforces this.

## Dec 1 → Dec 14: TestFlight
- [ ] `npm test`, `cd app && npm run typecheck`, `npx expo export --platform all` are green on `dev`.
- [ ] `eas build --profile preview --platform ios`, then install on internal testers' devices.
- [ ] `eas build --profile production --platform ios`. The build number auto-increments (`appVersionSource: remote` + `autoIncrement`).
- [ ] `eas submit --profile production --platform ios`, then TestFlight internal group, then external group (beta review).
- [ ] Device pass:
  - [ ] sign up / sign in / "Not now" guest flow
  - [ ] first saved hunt is held and saves after sign-in
  - [ ] map and terrain
  - [ ] location prompt text
  - [ ] photo and camera prompt text
  - [ ] purchase, restore and sandbox renewals
  - [ ] delete account
  - [ ] offline Hunt Log

## Dec 14 → Dec 21: store listing and submission
- [ ] Screenshots (6.9" and 6.5" iPhone, plus iPad if `supportsTablet` stays true), app icon 1024², subtitle, keywords, description, support URL.
- [ ] Privacy Policy URL and Terms URL live (same as `legal` in the app). Privacy "nutrition label": location (app functionality, not tracking), photos, account info, purchases.
- [ ] Age rating questionnaire (hunting: realistic violence "none"; check the weapons references answer).
- [ ] Export compliance: `usesNonExemptEncryption: false` is set (HTTPS only).
- [ ] Review notes: a demo account, how to reach the paywall, and that passes are placeholders until RevenueCat is live.
- [ ] Account deletion is reachable in-app (Guideline 5.1.1(v)).
- [ ] Subscription disclosure on the paywall (3.1.2): already covered by tests.
- [ ] Submit for review by **Dec 21**. Apple's holiday slowdown is usually about Dec 22–27, so submit early.

## To add later: permission strings

Location ships (When In Use only) via the `expo-location` plugin in app.json: "BirdBrain shows where you are on the map so you can see which land you're on." No camera or photo-library strings yet. Add each one in `app.config.ts` → `ios.infoPlist` (plus the expo plugin) in the same PR as the feature, worded plainly:

- `NSLocationWhenInUseUsageDescription`: when the map shows your position (e.g. "Shows where you are on the map. Your location isn't saved or shared.").
- `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`: when hunt-log photos ship.
- Don't add `NSLocationAlwaysAndWhenInUseUsageDescription` or `NSPhotoLibraryAddUsageDescription` unless a feature really needs background location or saving to the library.

## Not possible from the Linux dev box
- iOS builds (`eas build --local` for iOS) need macOS + Xcode. Use EAS cloud builds (a human starts them) or a Mac.
