import { backend } from '@/data';
import { isNetworkError } from '@/lib/connectivity';

/** Client rule: 3–20 letters, numbers or underscores, stored lowercase. Stricter than the DB check (^[a-z0-9_]{3,24}$). */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

/** Returns an error message, or null when the name is valid. */
export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'Usernames need at least 3 characters.';
  if (u.length > 20) return 'Usernames can be up to 20 characters.';
  if (!USERNAME_RE.test(u)) return 'Use only letters, numbers and underscores.';
  return null;
}

export const TAKEN = 'That username is taken.';
export const NO_SIGNAL = 'Couldn’t save without signal. Try again when you have service, or skip for now.';

/** Saves to profiles.username for the signed-in user. Throws an Error with a user-facing message. */
export async function saveUsername(raw: string): Promise<string> {
  const invalid = validateUsername(raw);
  if (invalid) throw new Error(invalid);
  const u = normalizeUsername(raw);
  try {
    const p = await backend.updateProfile({ username: u });
    return p.username ?? u;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === '23505' || err?.message === TAKEN || /duplicate key|profiles_username_key/i.test(err?.message ?? '')) throw new Error(TAKEN);
    if (isNetworkError(e)) throw new Error(NO_SIGNAL);
    throw new Error(err?.message || 'Couldn’t save your username. Please try again.');
  }
}

/** True when a signed-in user has no username yet. Fails closed (false) offline so nothing blocks. */
export async function needsUsername(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const p = await backend.profile(userId);
    return !!p && !p.username;
  } catch {
    return false;
  }
}
