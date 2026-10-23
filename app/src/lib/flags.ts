/**
 * Feature flags (public, build-time). Off unless explicitly enabled.
 *
 * appleSignIn: BLOCKED on Apple keys (Services ID, key ID, .p8) not existing
 * yet. While off, the Apple button is hidden and email is the only sign-in.
 */
export const flags = {
  appleSignIn: process.env.EXPO_PUBLIC_FLAG_APPLE_SIGN_IN === '1',
};
