# Tester distribution plan (draft — nothing deployed)

Scope: a small **friends-and-family pre-beta**, not public recruiting. Goal: one unlisted link, shared directly with invited people. It sends iPhones to TestFlight and Android phones to an EAS internal APK.

## Channels
| | Today (field test) | Next |
|---|---|---|
| iOS | Expo Go + `fieldtest` EAS Update (runtime 1.0.0) — unchanged | TestFlight public link with a **small tester cap (10–25, set in App Store Connect)**, built from the `production` profile (store build, `channel: production`, remote autoIncrement buildNumber) |
| Android | Expo Go | `preview` profile: internal-distribution APK, `channel: preview`. No Play account needed |

Build commands (not run yet; each needs RBChedda's go-ahead):
- `eas build -p android --profile preview` → APK + an install page/QR on expo.dev
- `eas build -p ios --profile production` then `eas submit -p ios --profile production`

`production` must never set `EXPO_PUBLIC_FIELDTEST_UNLOCK`. The M2 guard (`npm run check:eas`) enforces this and runs before every EAS build.

Versions: `version` 1.0.0. `ios.buildNumber` "1" / `android.versionCode` 1 are local defaults only; `appVersionSource: remote` means EAS owns the real counters. Runtime: iOS uses `policy: appVersion` (→ 1.0.0), and the top level stays `exposdk:57.0.0` for Expo Go. Bumping `version` changes the iOS runtime, so OTA updates stop matching older builds.

## Invite page (minimal, unlisted)
The page has `noindex, nofollow` meta and a `docs/invite/robots.txt` that disallows everything. Nothing links to it. The URL is only sent directly to invitees. Note that robots.txt only counts at the site root, so if the page is served under a subpath (Pages project site), the meta tag is what protects it.

`docs/invite/index.html` is a static page meant for GitHub Pages (not deployed). It checks the user agent:
- iPhone/iPad → install TestFlight, then open the public link (`TESTFLIGHT_PUBLIC_LINK`)
- Android → open the EAS internal build page (`EAS_APK_LINK`), download the APK, allow "install unknown apps", install
- Desktop → shows both options plus a QR for the page

Swap the placeholders once the builds exist.

## Checklist — needed from RBChedda
1. [ ] **Apple Developer Program** membership ($99/yr) and the Apple ID / team to use
2. [ ] **Confirm the bundle id / package**: proposed `com.rbchedda.birdbrain` (TO CONFIRM; it becomes permanent after step 3)
3. [ ] **App Store Connect app record** (name, SKU, primary language, bundle id)
4. [ ] **TestFlight public link tester limit** set to 10–25 in App Store Connect
5. [ ] **TestFlight Beta App Review** passed for the first build (required before the public link works)
6. [ ] **EAS submit credentials**: an App Store Connect API key (Issuer ID, Key ID, .p8) uploaded to EAS, plus the ASC app id (`ascAppId`) for `submit.production`
7. [ ] **Android**: nothing needed for the internal APK (EAS builds and hosts it; the Expo account already exists). Later, a Play Console account ($25 one-time) for Play internal testing / release
8. [ ] **Privacy policy URL** (required by TestFlight external testing and Play)
9. [ ] **TestFlight test information**: feedback email, contact name/phone/email for review, a beta description, "what to test", and a demo sign-in if review needs one
10. [ ] Approve where the invite page is hosted (e.g. GitHub Pages on this repo)
