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

export const USAGE = {
  location:
    'BirdBrain uses your location to show where you are on the map, which game lands and stocked fields are nearby, and what hunting hours apply. Your spot stays private.',
  locationAlways:
    'BirdBrain only uses your location while the app is open, to show where you are on the map. It never shares where you hunt.',
  photos: 'Lets you add photos of your dog, birds or the field to your private hunt log.',
  photosAdd: 'Lets BirdBrain save hunt photos to your library when you choose to.',
  camera: 'Lets you take a photo for your hunt log right from the field.',
};

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
      infoPlist: {
        ...config.ios?.infoPlist,
        NSLocationWhenInUseUsageDescription: USAGE.location,
        NSLocationAlwaysAndWhenInUseUsageDescription: USAGE.locationAlways,
        NSPhotoLibraryUsageDescription: USAGE.photos,
        NSPhotoLibraryAddUsageDescription: USAGE.photosAdd,
        NSCameraUsageDescription: USAGE.camera,
      },
    },
    android: { ...config.android, package: IOS_BUNDLE_ID },
    extra: { ...config.extra, appleSignIn, revenueCat },
  };
};
