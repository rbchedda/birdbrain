/**
 * Public client config, inlined by Expo from EXPO_PUBLIC_* variables (see the
 * repo's .env.example). When either is missing the app runs on sample data.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseKey);
