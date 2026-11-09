/**
 * Safe probe for the expo-image-manipulator native module. An EAS Update can
 * ship this JS to a fieldtest client that does not yet include the native
 * module; requireNativeModule would throw. This must never crash.
 */
export function getExpoImageManipulatorNative(): { manipulate?: unknown } | null {
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: (name: string) => { manipulate?: unknown } | null;
    };
    return requireOptionalNativeModule('ExpoImageManipulator');
  } catch {
    return null;
  }
}
