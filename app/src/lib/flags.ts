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
/**
 * statsShare: OFF until a lawyer has checked the Stats share card (aggregates
 * only, no places, dates or dogs). While off there is no share button and the
 * share route says it is not available.
 *
 * woodcockLog: OFF until the hosted `public.species` enum and the diary
 * validator accept 'woodcock' (hosted-changes-needed.md). While off, woodcock
 * cannot be picked when logging and Stats groups it with grouse.
 *
 * crewSpotVerdict: OFF until hosted has plans.show_spot_verdict_to_crew and
 * plans.spot_verdict_snapshot (hosted-changes-needed.md; migration
 * 20261105000100_plans_show_spot_verdict.sql). While off, the crew toggle and
 * crew card are hidden, and supabase plans upsert/select never mention those
 * columns (fieldtest against hosted stays safe). Owner-only verdict still shows.
 */
export const flags = {
  /** Read on each access so tests can flip them; builds still inline the env var. */
  get statsShare() {
    return process.env.EXPO_PUBLIC_FLAG_STATS_SHARE === '1';
  },
  get woodcockLog() {
    return process.env.EXPO_PUBLIC_FLAG_WOODCOCK_LOG === '1';
  },
  get crewSpotVerdict() {
    return process.env.EXPO_PUBLIC_FLAG_CREW_SPOT_VERDICT === '1';
  },
  appleSignIn: process.env.EXPO_PUBLIC_FLAG_APPLE_SIGN_IN === '1',
  plans: process.env.EXPO_PUBLIC_FLAG_PLANS !== '0',

  /**
   * diaryShare: OFF until hosted has share_links + diary_share_status. While off: no Share UI, no share RPCs.
   */
  get diaryShare() {
    return process.env.EXPO_PUBLIC_FLAG_DIARY_SHARE === '1';
  },
  /**
   * publicDiaryShare: OFF until lawyer/product ship the public no-account viewer.
   * SQL public_diary_share_enabled() also defaults false. App hides "Anyone with the link".
   * Requires diaryShare on as well.
   */
  get publicDiaryShare() {
    return process.env.EXPO_PUBLIC_FLAG_PUBLIC_DIARY_SHARE === '1';
  },
  /**
   * shareLinkViewCounts: OFF until product turns on owner-only totals.
   * SQL share_link_view_counts_enabled() also defaults false. Display: "Viewed {n} times".
   */
  get shareLinkViewCounts() {
    return process.env.EXPO_PUBLIC_FLAG_SHARE_LINK_VIEW_COUNTS === '1';
  },
};
