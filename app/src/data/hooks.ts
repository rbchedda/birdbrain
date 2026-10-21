import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { AppState, Platform } from 'react-native';

import type { Session } from './backend';
import { journalEntries, onJournalChange, startJournalSync, syncJournal } from './journal';
import { backend } from './index';
import type { Place } from './types';

/** Run an async loader, re-running when deps change. Stale results are dropped. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => id === seq.current && setState({ data, loading: false }),
      (error: Error) => id === seq.current && setState((s) => ({ ...s, error, loading: false })),
    );
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

// Session: one subscription shared by every screen.
let session: Session | null | undefined;
const sessionListeners = new Set<() => void>();
const setSession = (s: Session | null) => {
  session = s;
  sessionListeners.forEach((l) => l());
};
let sessionStarted = false;
function startSession() {
  if (sessionStarted) return;
  sessionStarted = true;
  backend.getSession().then(setSession, () => setSession(null));
  backend.onSessionChange(setSession);
}

/** undefined while the stored session is loading, then Session or null. */
export function useSession() {
  startSession();
  return useSyncExternalStore(
    (l) => {
      sessionListeners.add(l);
      return () => sessionListeners.delete(l);
    },
    () => session,
    () => session,
  );
}

// Places: loaded once per launch and shared by the map, the log and the feed.
type PlacesState = { places: Place[]; loading: boolean; error?: Error };
let places: PlacesState = { places: [], loading: false };
let placesPromise: Promise<void> | null = null;
const placeListeners = new Set<() => void>();
const setPlaces = (p: PlacesState) => {
  places = p;
  placeListeners.forEach((l) => l());
};

export function loadPlaces(force = false) {
  if (placesPromise && !force) return placesPromise;
  setPlaces({ ...places, loading: true, error: undefined });
  placesPromise = backend.listPlaces().then(
    (list) => setPlaces({ places: list, loading: false }),
    (error: Error) => {
      placesPromise = null;
      setPlaces({ ...places, loading: false, error });
    },
  );
  return placesPromise;
}

export function usePlaces() {
  useEffect(() => {
    loadPlaces();
  }, []);
  return useSyncExternalStore(
    (l) => {
      placeListeners.add(l);
      return () => placeListeners.delete(l);
    },
    () => places,
    () => places,
  );
}

// Private hunt log: one background sync for the whole app, started on first use.
let journalSyncStarted = false;
function startJournalSyncOnce() {
  if (journalSyncStarted) return;
  journalSyncStarted = true;
  startJournalSync(backend, {
    onForeground: (cb) => {
      const sub = AppState.addEventListener('change', (s) => s === 'active' && cb());
      return () => sub.remove();
    },
    onReconnect: (cb) => {
      // Web exposes connectivity events; on native, foreground + backoff timers cover retries.
      const w = globalThis as { addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void };
      if (Platform.OS !== 'web' || !w.addEventListener) return () => {};
      w.addEventListener('online', cb);
      return () => w.removeEventListener?.('online', cb);
    },
  });
}

/** Private hunt log entries with live sync status. */
export function useJournal() {
  startJournalSyncOnce();
  const state = useAsync(journalEntries, []);
  const { reload } = state;
  useEffect(() => onJournalChange(reload), [reload]);
  const retry = useCallback(() => syncJournal(backend, { force: true }).then(() => undefined), []);
  return { ...state, retry };
}
