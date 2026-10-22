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

export default ({ config }: ConfigContext): ExpoConfig => {
  const appleSignIn = process.env.EXPO_PUBLIC_FLAG_APPLE_SIGN_IN === '1';
  const revenueCat = process.env.EXPO_PUBLIC_PURCHASES_PROVIDER === 'revenuecat';
  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      bundleIdentifier: IOS_BUNDLE_ID,
      // buildNumber is managed remotely by EAS (appVersionSource: remote + autoIncrement).
      usesAppleSignIn: appleSignIn,
      config: { ...config.ios?.config, usesNonExemptEncryption: false },
    },
    android: { ...config.android, package: IOS_BUNDLE_ID },
    extra: { ...config.extra, appleSignIn, revenueCat },
  };
};
