/**
 * Feature flags (public, build-time). Off unless explicitly enabled.
 *
 * appleSignIn: BLOCKED on Apple keys (Services ID, key ID, .p8) not existing
 * yet. While off, the Apple button is hidden and email is the only sign-in.
 *
 * plans: gates any server path for hunt plans. A hosted plans table is NOT
 * approved; while off, plans stay on the phone only (lib/plans.ts).
 */
export const flags = {
  appleSignIn: process.env.EXPO_PUBLIC_FLAG_APPLE_SIGN_IN === '1',
  plans: process.env.EXPO_PUBLIC_FLAG_PLANS === '1',
};
