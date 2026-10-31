import { hasSupabase, useSampleData } from '@/lib/env';
import { clearStoredSession, supabase } from '@/lib/supabase';

import type { Backend } from './backend';
import { createSampleBackend } from './sampleBackend';
import { createSupabaseBackend } from './supabaseBackend';
import { createUnconfiguredBackend } from './unconfiguredBackend';

/**
 * Supabase when EXPO_PUBLIC_SUPABASE_* is set (always wins). Otherwise sample
 * data only with the EXPO_PUBLIC_USE_SAMPLE_DATA=1 dev flag or in tests;
 * anything else (e.g. Expo Go without app/.env) gets a backend that errors.
 */
export const backend: Backend =
  hasSupabase && supabase
    ? createSupabaseBackend(supabase, { clearStoredSession })
    : useSampleData
      ? createSampleBackend()
      : createUnconfiguredBackend();
