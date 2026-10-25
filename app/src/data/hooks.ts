import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { AppState, Platform } from 'react-native';

import type { Session } from './backend';
import { onReconnect as onConnectivityBack, startConnectivity } from '@/lib/connectivity';
import { getPullState, journalEntries, onJournalChange, onPullChange, pullJournal, startJournalSync, syncJournal } from './journal';
import { cachedPlace, pullPlans, setPlansSyncKick, syncPlans, toPlanPlace, type PlansPullReport } from '@/lib/plans';
import { backend } from './index';
import { cachedSafetyPlaces, saveSafetyPlaces } from '@/offline/safetyCache';

import type { DataSource, Place } from './types';

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
    (list) => {
      setPlaces({ places: list, loading: false });
      void saveSafetyPlaces(list);
    },
    async (error: Error) => {
      placesPromise = null;
      // Offline: keep showing the last places we had so pins and access labels still draw.
      const saved = places.places.length ? places.places : await cachedSafetyPlaces();
      setPlaces({ places: saved, loading: false, error });
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
      startConnectivity();
      return onConnectivityBack(cb);
    },
    onSignIn: (cb) => {
      startSession();
      let had = !!session;
      const l = () => {
        const has = !!session;
        if (has && !had) cb();
        had = has;
      };
      sessionListeners.add(l);
      return () => sessionListeners.delete(l);
    },
  });
}

/**
 * Push the queue, then pull own + crew-shared plans and merge (signed in only).
 * Failures keep the local store as is. Profile › Plans calls this on focus.
 */
export async function refreshPlans(): Promise<PlansPullReport | null> {
  const userId = session?.userId;
  if (!userId) return null;
  try {
    await syncPlans(backend, userId);
    await loadPlaces();
    const byId = new Map(places.places.map((p) => [p.id, p]));
    return await pullPlans(backend, userId, (id) => cachedPlace(id) ?? (byId.get(id) ? toPlanPlace(byId.get(id)!) : null));
  } catch {
    return null;
  }
}

// Hunt plans: push the queue on any change, foreground, reconnect and sign-in (offline queue kept on failure).
let plansSyncStarted = false;
export function startPlansSyncOnce() {
  if (plansSyncStarted) return;
  plansSyncStarted = true;
  startSession();
  const run = () => {
    if (session?.userId) syncPlans(backend, session.userId).catch(() => undefined);
  };
  setPlansSyncKick(run);
  // App start and sign-in also pull (cross-device + crew-shared plans).
  sessionListeners.add(() => void refreshPlans());
  void refreshPlans();
  AppState.addEventListener('change', (s) => s === 'active' && run());
  startConnectivity();
  onConnectivityBack(run);
  sessionListeners.add(run);
  run();
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

/** Progress of restoring this account's hunts from the server (new phone, reinstall). */
export function usePullState() {
  return useSyncExternalStore(onPullChange, getPullState, getPullState);
}

/** Upload anything waiting, then pull the account's hunts again. Forced for "try again"; otherwise at most once a minute. */
export async function refreshFromAccount(force = true) {
  await syncJournal(backend, { force }).catch(() => undefined);
  return pullJournal(backend, { force });
}

/** Per-layer dates from ingest_state (Data sources page, place sheets). Empty until loaded or on error. */
export function useDataSources(): DataSource[] {
  const { data } = useAsync(() => backend.dataSources().catch(() => [] as DataSource[]), []);
  return data ?? [];
}
