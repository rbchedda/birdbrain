import { supabase } from '@/lib/supabase';

import type { Backend } from './backend';
import { createSampleBackend } from './sampleBackend';
import { createSupabaseBackend } from './supabaseBackend';

/** Supabase when EXPO_PUBLIC_SUPABASE_* is set, otherwise offline sample data. */
export const backend: Backend = supabase ? createSupabaseBackend(supabase) : createSampleBackend();
