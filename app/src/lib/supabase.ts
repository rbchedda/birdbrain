import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env, hasSupabase } from './env';
import { createSessionStorage } from './secureSession';

/** Native: chunked SecureStore (migrated from AsyncStorage once). Web: localStorage. */
export const sessionStorage = hasSupabase ? createSessionStorage(env.supabaseUrl) : null;

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { storage: sessionStorage!, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    })
  : null;

/** Belt and braces after signOut: drop the session and every chunk. */
export async function clearStoredSession(): Promise<void> {
  await sessionStorage?.clear().catch(() => undefined);
}

// Only refresh tokens while the app is in the foreground on mobile.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
