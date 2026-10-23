import { AppState, Platform } from 'react-native';

import { env } from '@/lib/env';

/**
 * Best-effort "do we have signal" store. No native reachability module is
 * bundled yet (adding NetInfo needs a new native build), so it learns from:
 * web online/offline events, network errors and successes reported by callers,
 * and a short health probe on foreground. `back` flips true when signal
 * returns after being lost, which turns the pending chip orange (spec 05).
 */
export type Signal = { online: boolean; back: boolean };
let state: Signal = { online: true, back: false };
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

export const getSignal = () => state;
export function onSignal(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
/** Fires when signal comes back (offline → online). */
export function onReconnect(cb: () => void) {
  reconnectListeners.add(cb);
  return () => {
    reconnectListeners.delete(cb);
  };
}

export function reportSignal(online: boolean) {
  if (online === state.online) return;
  state = { online, back: online };
  listeners.forEach((l) => l());
  if (online) reconnectListeners.forEach((l) => l());
}

/** Test hook. */
export function resetSignal(s: Signal = { online: true, back: false }) {
  state = s;
  listeners.forEach((l) => l());
}

export async function probeSignal(): Promise<boolean> {
  if (!env.supabaseUrl || typeof fetch !== 'function') return state.online;
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctl?.abort(), 5000);
    await fetch(`${env.supabaseUrl}/auth/v1/health`, { method: 'GET', signal: ctl?.signal });
    clearTimeout(t);
    reportSignal(true);
    return true;
  } catch {
    reportSignal(false);
    return false;
  }
}

let started = false;
export function startConnectivity() {
  if (started) return;
  started = true;
  const w = globalThis as { addEventListener?: (e: string, f: () => void) => void; navigator?: { onLine?: boolean } };
  if (Platform.OS === 'web' && w.addEventListener) {
    if (w.navigator?.onLine === false) reportSignal(false);
    w.addEventListener('online', () => reportSignal(true));
    w.addEventListener('offline', () => reportSignal(false));
  }
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && !state.online) void probeSignal();
  });
}

/** fetch/Supabase errors that mean "no connection", not "wrong password". */
export function isNetworkError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  return /network|failed to fetch|fetch failed|load failed|timed? ?out|offline|internet/i.test(err.message ?? '');
}
