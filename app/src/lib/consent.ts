import Constants from 'expo-constants';

import { backend } from '@/data';

import { readJson, writeJson } from './localStore';

/*
 * THIN ADAPTER over dev-1's consent API (PR #25, feat/onboarding-consent,
 * app/src/lib/termsConsent.ts), which has NOT merged into dev yet. Same names,
 * signatures, storage keys and record shape, so once #25 lands this whole file
 * becomes:   export * from './termsConsent';
 * Only the subset guest mode needs: getConsent, needsConsent, acceptTerms,
 * syncConsentOnSignIn, TERMS_VERSION. (useTermsConsent and the gate UI stay in #25.)
 */

/** Mirrors #25's data/terms.ts TERMS_VERSION. */
export const TERMS_VERSION = '2026-10-22';
const ACCEPTED_KEY = 'birdbrain.termsAccepted.v1';
const QUEUE_KEY = 'birdbrain.termsQueue.v1';

export interface TermsAcceptance {
  acceptedAt: string;
  appVersion: string;
  termsVersion: string;
}
export interface ConsentSnapshot {
  state: 'needed' | 'accepted';
  acceptance: TermsAcceptance | null;
  pendingSync: number;
}
export interface ConsentSyncResult {
  sent: number;
  pending: number;
}

const appVersion = () => Constants.expoConfig?.version ?? 'unknown';
const readQueue = () => readJson<TermsAcceptance[]>(QUEUE_KEY, []);
const readAccepted = () => readJson<TermsAcceptance | null>(ACCEPTED_KEY, null);

export const needsConsent = (accepted: TermsAcceptance | null, current = TERMS_VERSION) => !accepted || accepted.termsVersion !== current;

/** Local consent only; works signed out, no network. */
export async function getConsent(): Promise<ConsentSnapshot> {
  const acceptance = await readAccepted();
  return { state: needsConsent(acceptance) ? 'needed' : 'accepted', acceptance, pendingSync: (await readQueue()).length };
}

async function flush(): Promise<number> {
  const queue = await readQueue();
  if (!queue.length) return 0;
  // Signed out (guests have no user_id): keep it on the device.
  if (!(await backend.getSession().catch(() => null))) return 0;
  const left: TermsAcceptance[] = [];
  for (const a of queue) await backend.recordTermsAcceptance(a).catch(() => left.push(a));
  await writeJson(QUEUE_KEY, left);
  return queue.length - left.length;
}

/** Record acceptance on the device (works signed out), queue it, and send if signed in. */
export async function acceptTerms(now = new Date()): Promise<TermsAcceptance> {
  const a: TermsAcceptance = { acceptedAt: now.toISOString(), appVersion: appVersion(), termsVersion: TERMS_VERSION };
  await writeJson(ACCEPTED_KEY, a);
  const queue = await readQueue();
  if (!queue.some((q) => q.termsVersion === a.termsVersion)) await writeJson(QUEUE_KEY, [...queue, a]);
  await flush();
  return a;
}

/** Call after a real sign-in: sync this device's acceptance to accepted_terms. Failures stay queued. */
export async function syncConsentOnSignIn(): Promise<ConsentSyncResult> {
  const acceptance = await readAccepted();
  if (acceptance && !needsConsent(acceptance)) {
    const queue = await readQueue();
    if (!queue.some((q) => q.termsVersion === acceptance.termsVersion)) await writeJson(QUEUE_KEY, [...queue, acceptance]);
  }
  const sent = await flush();
  return { sent, pending: (await readQueue()).length };
}
