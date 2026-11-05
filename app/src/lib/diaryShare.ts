import { Share } from 'react-native';

import { env } from '@/lib/env';

/** Default share-link lifetime (days). Keep in sync with SQL default on create_diary_share_link. */
export const DIARY_SHARE_DEFAULT_TTL_DAYS = 30;
/** Hard cap; SQL clamps to the same. No "Never" option. */
export const DIARY_SHARE_MAX_TTL_DAYS = 365;
/** Expiry chips shown on the share sheet (all ≤ MAX). */
export const DIARY_SHARE_TTL_OPTIONS = [7, 30, 90, 365] as const;

/** Exact owner display copy for view totals (lawyer). */
export function formatViewedTimes(n: number): string {
  return `Viewed ${Math.max(0, Math.floor(n))} times`;
}

/** Share-sheet disclosure (lawyer). */
export const DIARY_SHARE_VIEW_COUNT_DISCLOSE =
  "You'll see how many times your link is viewed, not who viewed it.";

/** Photo landmark warning (lawyer). Exact wording. */
export const DIARY_SHARE_PHOTO_WARNING =
  'Photos can give away a spot. Signs, gates, parking areas and license plates can show where you were. Crop them out before sharing. We remove location data from the file.';

/** Days before expires_at to surface an in-app reminder. */
export const DIARY_SHARE_EXPIRY_REMIND_WITHIN_DAYS = 3;

export function diaryShareExpiringSoon(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const exp = Date.parse(expiresAt);
  if (!Number.isFinite(exp)) return false;
  const ms = exp - now;
  return ms > 0 && ms <= DIARY_SHARE_EXPIRY_REMIND_WITHIN_DAYS * 86400000;
}

/** Build the public viewer URL for a diary share token. */
export function diaryShareUrl(token: string): string {
  const path = `/share/?t=${encodeURIComponent(token)}`;
  return env.shareBaseUrl ? `${env.shareBaseUrl}${path}` : path;
}

/** Copy/share a diary link the same way SpotActions.copyCoords does (no clipboard native module). */
export async function shareDiaryLink(token: string): Promise<void> {
  const url = diaryShareUrl(token);
  const message = `View my BirdBrain hunt diary: ${url}`;
  const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(url).catch(() => {});
    return;
  }
  await Share.share({ message, url }).catch(() => {});
}
