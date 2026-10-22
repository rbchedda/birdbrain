import { journalEntries } from '@/data/journal';
import { readJson, writeJson } from '@/lib/localStore';

/**
 * First-save field flow: a signed-out hunt is written to the journal (with its
 * idempotent client UUID) BEFORE the sign-in sheet opens, and this key remembers
 * which entry is waiting on sign-in so the sheet comes back after a kill,
 * a failed sign-up or no signal. The journal itself does the upload once a
 * session exists, so restoring never creates a second copy.
 */
export const HELD_HUNT_KEY = 'birdbrain.heldHunt.v1';
export const noSignalText = 'No signal. Your hunt is saved on this phone, sign in when you have service';
export const confirmPendingText = 'Check your email to confirm your account. Your hunt is saved on this phone and backs up as soon as you sign in.';
export const offlineIndicatorText = 'Offline, saved on phone';

export interface HeldHunt {
  /** Journal entry id (== client UUID). */
  id: string;
  label: string;
  /** Sign-up done, waiting for the email confirmation. */
  confirmPending?: boolean;
}

export const holdHunt = (h: HeldHunt) => writeJson(HELD_HUNT_KEY, h);
export const clearHeldHunt = () => writeJson(HELD_HUNT_KEY, null);

/** The held hunt, or null if it's gone or already backed up. */
export async function heldHunt(): Promise<HeldHunt | null> {
  const h = await readJson<HeldHunt | null>(HELD_HUNT_KEY, null);
  if (!h) return null;
  const e = (await journalEntries()).find((x) => x.id === h.id);
  if (!e || e.sync.status === 'synced') {
    await clearHeldHunt();
    return null;
  }
  return h;
}

export async function markConfirmPending() {
  const h = await heldHunt();
  if (h) await holdHunt({ ...h, confirmPending: true });
  return h;
}

/** fetch/Supabase errors that mean "no connection", not "wrong password". */
export function isNetworkError(e: unknown): boolean {
  const err = e as { name?: string; message?: string; status?: number } | null;
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  return /network|failed to fetch|fetch failed|load failed|timed? ?out|offline|internet/i.test(err.message ?? '');
}
