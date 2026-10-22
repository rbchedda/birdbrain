import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';

import type { TermsAcceptance } from '@/data/backend';
import { backend } from '@/data';
import { TERMS_VERSION } from '@/data/terms';

import { readJson, writeJson } from './localStore';

const ACCEPTED_KEY = 'birdbrain.termsAccepted.v1';
const QUEUE_KEY = 'birdbrain.termsQueue.v1';

export const appVersion = () => Constants.expoConfig?.version ?? 'unknown';

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

let flushing: Promise<number> | null = null;
/**
 * Send queued acceptances to accepted_terms when signed in. Rows that fail stay
 * queued for the next sign-in or launch. Returns how many were sent.
 */
export function flushTermsQueue(): Promise<number> {
  flushing ??= (async () => {
    try {
      const queue = await readQueue();
      if (!queue.length) return 0;
      const session = await backend.getSession().catch(() => null);
      if (!session) return 0;
      const left: TermsAcceptance[] = [];
      let sent = 0;
      for (const a of queue) {
        try {
          await backend.recordTermsAcceptance(a);
          sent++;
        } catch {
          left.push(a);
        }
      }
      await writeJson(QUEUE_KEY, left);
      return sent;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

function start() {
  started ??= (async () => {
    const accepted = await readJson<TermsAcceptance | null>(ACCEPTED_KEY, null);
    set(needsConsent(accepted) ? 'needed' : 'accepted');
    unsubscribe = backend.onSessionChange((s) => {
      if (s) void flushTermsQueue();
    });
    void flushTermsQueue();
  })();
  return started;
}

/**
 * Record acceptance of the current terms: saved on the device first, queued,
 * then sent if signed in (signed-out users' acceptances flush on sign-in).
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
