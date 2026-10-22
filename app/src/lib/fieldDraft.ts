import { journalEntries, type JournalEntry } from '@/data/journal';
import { readJson, writeJson } from '@/lib/localStore';

/**
 * First-save field flow (designer spec signin-offline, states 01-08).
 * A signed-out hunt is written to the journal, with its idempotent client
 * UUID, BEFORE any sign-in UI shows. The journal uploads it once a session
 * exists, so nothing here ever deletes or duplicates a hunt.
 */
export const copy = {
  sheetTitle: 'Sign in to save this hunt',
  sheetBody: 'Your hunt is already saved on this phone. Sign in once to back it up; only you can see it.',
  savedOfflineTitle: 'Saved on this phone',
  savedOffline: "Saved on this phone. We'll finish sign-in when you have signal.",
  savedOfflineMore: 'Your hunt is safe here, even if the app closes.',
  backToMap: 'OK, back to map',
  waiting: 'Waiting to sync',
  noSignal: 'No signal',
  retry: 'Retry',
  signInFailed: "Sign-in didn't finish. Your hunt is still saved on this phone.",
  savedToAccount: 'Hunt saved to your account.',
  welcomeBack: 'Welcome back. Your unsynced hunt is still here.',
  confirmPending: 'Check your email to confirm your account. Your hunt is still saved on this phone.',
  storageFull: 'Couldn’t save — free up space',
};
export const chipText = (n: number) => (n === 1 ? '1 hunt waiting — sign in' : `${n} hunts waiting — sign in`);
export const signalBackText = (n: number) => `Signal back. Sign in to sync ${n} ${n === 1 ? 'hunt' : 'hunts'}`;

/** Not yet on the server: the hunts the chip counts. Conflicts are handled in the diary. */
export const isPendingHunt = (e: JournalEntry) => e.sync.status !== 'synced' && !e.deleted;
export async function pendingHunts() {
  return (await journalEntries()).filter(isPendingHunt);
}

// --- small persisted flags ---------------------------------------------------

const FLAGS_KEY = 'birdbrain.fieldFlags.v1';
interface Flags {
  /** Last sign-in attempt failed or was cancelled: the chip shows Retry (06). */
  signInFailed?: boolean;
  /** Sign-up waiting on the email link. */
  confirmPending?: boolean;
}
export const readFlags = () => readJson<Flags>(FLAGS_KEY, {});
export async function setFlags(patch: Flags) {
  const cur = await readFlags();
  await writeJson(FLAGS_KEY, { ...cur, ...patch });
  emit();
}

// --- toasts (non-blocking, auto-dismiss; never a modal) -----------------------

type ToastListener = (text: string) => void;
const toastListeners = new Set<ToastListener>();
export function onToast(cb: ToastListener) {
  toastListeners.add(cb);
  return () => {
    toastListeners.delete(cb);
  };
}
export const showToast = (text: string) => toastListeners.forEach((l) => l(text));
export const TOAST_MS = 4000;

const changeListeners = new Set<() => void>();
export function onFieldChange(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}
const emit = () => changeListeners.forEach((l) => l());

/** Sign-in didn't finish (cancelled, wrong password, no signal): keep the hunt, show Retry. */
export async function signInDidNotFinish() {
  if (!(await pendingHunts()).length) return;
  await setFlags({ signInFailed: true });
  showToast(copy.signInFailed);
}

// One-time "welcome back" toast per cold start when the queue survived a kill/reboot.
let welcomed = false;
/** A hunt saved during this run isn't a survivor of a kill/reboot: no welcome-back toast. */
export const skipWelcomeBack = () => {
  welcomed = true;
};
export async function welcomeBackOnce() {
  if (welcomed) return false;
  welcomed = true;
  if (!(await pendingHunts()).length) return false;
  showToast(copy.welcomeBack);
  return true;
}
/** Test hook: simulate a cold start. */
export function resetFieldForRestart() {
  welcomed = false;
}

export { isNetworkError } from '@/lib/connectivity';
