import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Release config on top of app.json. Feature switches come from env so the
 * same code builds with them on or off (see eas.json profiles):
 *   EXPO_PUBLIC_FLAG_APPLE_SIGN_IN=1   adds the Sign in with Apple entitlement
 *   EXPO_PUBLIC_PURCHASES_PROVIDER     'mock' (default) or 'revenuecat'
 * Only public (EXPO_PUBLIC_*) keys belong here; never the Supabase server-only key.
 */
// PLACEHOLDER: no bundle id was set in the repo or spec. Confirm before the first App Store Connect record.
export const IOS_BUNDLE_ID = process.env.BIRDBRAIN_IOS_BUNDLE_ID || 'com.rbchedda.birdbrain';

// Location is foreground / When In Use only (app.json: expo-location plugin, no background).
// No camera or photo-library strings yet (photos are "coming soon"); see docs/release.md.

// Launch links (src/lib/env.ts). Unset = TODO_PUBLISH placeholder in the app; see
// docs/launch/publish-checklist.md. Warn loudly at config/build time, never print values.
const LAUNCH_LINK_VARS = [
  'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
  'EXPO_PUBLIC_MAP_ERROR_URL',
] as const;
export const unsetLaunchLinkVars = (env: NodeJS.ProcessEnv = process.env): string[] =>
  LAUNCH_LINK_VARS.filter((k) => !env[k]?.trim() || env[k]!.includes('TODO_PUBLISH'));

export default ({ config }: ConfigContext): ExpoConfig => {
  const unset = unsetLaunchLinkVars();
  if (unset.length) {
    const prod = process.env.EAS_BUILD_PROFILE === 'production';
    console.warn(
      `[birdbrain] ${prod ? 'PRODUCTION BUILD with ' : ''}TODO_PUBLISH placeholder links: ${unset.join(', ')} unset. See docs/launch/publish-checklist.md.`,
    );
  }
  const appleSignIn = process.env.EXPO_PUBLIC_FLAG_APPLE_SIGN_IN === '1';
  const revenueCat = process.env.EXPO_PUBLIC_PURCHASES_PROVIDER === 'revenuecat';
  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      bundleIdentifier: IOS_BUNDLE_ID,
      // iPhone only for v1 (no iPad screenshots or iPad review). iPads run it in iPhone compatibility mode.
      supportsTablet: false,
      // buildNumber is managed remotely by EAS (appVersionSource: remote + autoIncrement).
      usesAppleSignIn: appleSignIn,
      config: { ...config.ios?.config, usesNonExemptEncryption: false },
    },
    android: { ...config.android, package: IOS_BUNDLE_ID },
    extra: { ...config.extra, appleSignIn, revenueCat },
  };
};
