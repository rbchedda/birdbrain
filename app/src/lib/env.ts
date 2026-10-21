/**
 * Public client config, inlined by Expo from EXPO_PUBLIC_* variables (see the
 * repo's .env.example). When either is missing the app runs on sample data.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseKey);

/**
 * Legal links shown on sign-in and profile.
 * TODO(P0.6): replace these placeholders with the real hosted privacy policy
 * and terms of service before store submission.
 */
export const legal = {
  privacyPolicyUrl: 'https://example.com/birdbrain/privacy-TODO',
  termsUrl: 'https://example.com/birdbrain/terms-TODO',
};

/** Minimum age to use BirdBrain (COPPA / store policy). */
export const MIN_AGE = 13;
