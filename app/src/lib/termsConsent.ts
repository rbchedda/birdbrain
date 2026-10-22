import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';

import type { TermsAcceptance } from '@/data/backend';
import { backend } from '@/data';
import { TERMS_VERSION } from '@/data/terms';

import { readJson, writeJson } from './localStore';

/*
 * Consent API (hybrid guest mode). Guests browse signed out with no user_id and
 * no anonymous account: acceptance lives on the device and is synced to
 * accepted_terms only when a real account signs in. Nothing here signs anyone
 * in. Public surface for other features (e.g. feat/guest-mode-hybrid):
 *
 *   getConsent(): Promise<ConsentSnapshot>      read local consent, no network
 *   acceptTerms(now?): Promise<TermsAcceptance> record acceptance locally (+ sync if signed in)
 *   syncConsentOnSignIn(): Promise<ConsentSyncResult>  call after a successful sign-in
 *   useTermsConsent(): ConsentState             React hook for the gate
 */

const ACCEPTED_KEY = 'birdbrain.termsAccepted.v1';
const QUEUE_KEY = 'birdbrain.termsQueue.v1';

export const appVersion = () => Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? 'unknown';

export type ConsentState = 'loading' | 'needed' | 'accepted';

// One in-memory copy shared by the root gate and Settings.
let state: ConsentState = 'loading';
let started: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<() => void>();
const set = (s: ConsentState) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Accepted on this device for the current terms version? Older versions re-show onboarding. */
export const needsConsent = (accepted: TermsAcceptance | null, current = TERMS_VERSION) =>
  !accepted || accepted.termsVersion !== current;

export const readQueue = () => readJson<TermsAcceptance[]>(QUEUE_KEY, []);
const readAccepted = () => readJson<TermsAcceptance | null>(ACCEPTED_KEY, null);

export interface ConsentSnapshot {
  /** 'needed' when nothing is accepted on this device or the accepted terms version is out of date. */
  state: Exclude<ConsentState, 'loading'>;
  /** Last acceptance stored on this device (timestamp, app_version, terms_version), or null. */
  acceptance: TermsAcceptance | null;
  /** Acceptances saved locally but not yet written to accepted_terms. */
  pendingSync: number;
}

/**
 * Current consent on this device. Works signed out (guests have no user_id);
 * reads local storage only and never calls auth or the network.
 */
export async function getConsent(): Promise<ConsentSnapshot> {
  const acceptance = await readAccepted();
  return {
    state: needsConsent(acceptance) ? 'needed' : 'accepted',
    acceptance,
    pendingSync: (await readQueue()).length,
  };
}

export interface ConsentSyncResult {
  /** Rows written (or already present) in accepted_terms for the signed-in user. */
  sent: number;
  /** Rows still queued (not signed in with a real account, or the request failed). */
  pending: number;
}

/**
 * Sync this device's consent to accepted_terms for the user who just signed in.
 * Call it after any successful sign-in; it is also run automatically on session
 * changes and at launch. The current acceptance is (re)queued so a different
 * account signing in on the same device gets its own row; the server ignores a
 * duplicate (user, terms_version). Guests, anonymous sessions and failures leave
 * the queue intact. Never signs in, never creates an account.
 */
export async function syncConsentOnSignIn(): Promise<ConsentSyncResult> {
  // A flush already in flight (e.g. for the previous account) read the queue
  // before this sign-in; let it finish so it can't drop the row we requeue.
  if (flushing) await flushing.catch(() => 0);
  const acceptance = await readAccepted();
  if (acceptance && !needsConsent(acceptance)) {
    const queue = await readQueue();
    if (!queue.some((q) => q.termsVersion === acceptance.termsVersion)) {
      await writeJson(QUEUE_KEY, [...queue, acceptance]);
    }
  }
  const sent = await flushTermsQueue();
  return { sent, pending: (await readQueue()).length };
}

const queueKey = (a: TermsAcceptance) => `${a.termsVersion}|${a.acceptedAt}`;
let flushing: Promise<number> | null = null;
/**
 * Internal: send queued acceptances to accepted_terms when signed in with a real account. Rows that fail stay
 * queued for the next sign-in or launch. Returns how many were sent.
 */
export function flushTermsQueue(): Promise<number> {
  flushing ??= (async () => {
    try {
      const queue = await readQueue();
      if (!queue.length) return 0;
      const session = await backend.getSession().catch(() => null);
      // Guests (no user_id) and anonymous sessions keep the acceptance on the device.
      if (!session || session.anonymous) return 0;
      const done = new Set<string>();
      for (const a of queue) {
        try {
          await backend.recordTermsAcceptance(a);
          done.add(queueKey(a));
        } catch {
          // stays queued
        }
      }
      // Re-read so anything queued while we were sending is kept.
      const now = await readQueue();
      await writeJson(QUEUE_KEY, now.filter((q) => !done.has(queueKey(q))));
      const sent = done.size;
      return sent;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

function start() {
  started ??= (async () => {
    const accepted = await readAccepted();
    set(needsConsent(accepted) ? 'needed' : 'accepted');
    unsubscribe = backend.onSessionChange((s) => {
      if (s && !s.anonymous) void syncConsentOnSignIn();
    });
    void flushTermsQueue();
  })();
  return started;
}

/**
 * Record acceptance of the current terms (the gate's Continue). Saved on the
 * device first and queued; sent now if a real account is signed in, otherwise
 * by syncConsentOnSignIn(). Works for guests with no user_id.
 */
export async function acceptTerms(now = new Date()) {
  const a: TermsAcceptance = { acceptedAt: now.toISOString(), appVersion: appVersion(), termsVersion: TERMS_VERSION };
  await writeJson(ACCEPTED_KEY, a);
  const queue = await readQueue();
  if (!queue.some((q) => q.termsVersion === a.termsVersion)) queue.push(a);
  await writeJson(QUEUE_KEY, queue);
  set('accepted');
  await flushTermsQueue();
  return a;
}

/** For tests: forget cached state so the next read comes from storage. */
export function resetTermsConsentCache() {
  unsubscribe?.();
  unsubscribe = null;
  started = null;
  flushing = null;
  state = 'loading';
}

/** React hook for the gate: 'loading' until local storage is read, then 'needed' or 'accepted'. */
export function useTermsConsent() {
  void start();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
