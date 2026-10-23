/**
 * Feature flags (public, build-time). Off unless explicitly enabled, except plans.
 *
 * appleSignIn: BLOCKED on Apple keys (Services ID, key ID, .p8) not existing
 * yet. While off, the Apple button is hidden and email is the only sign-in.
 *
 * plans: ON by default (EXPO_PUBLIC_FLAG_PLANS=0 turns it off). Syncs hunt
 * plans to hosted public.plans (hosted-changes-needed.md §2-3; PGlite tests in
 * supabase/tests/plans.test.mjs). Until that table is live, pushes fail and
 * plans stay queued as "waiting to sync"; off = phone-only.
 */
export const flags = {
  appleSignIn: process.env.EXPO_PUBLIC_FLAG_APPLE_SIGN_IN === '1',
  plans: process.env.EXPO_PUBLIC_FLAG_PLANS !== '0',
};
