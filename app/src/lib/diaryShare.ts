import { Share } from 'react-native';

import { env } from '@/lib/env';
import { flags } from '@/lib/flags';

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

/**
 * Photo landmark warning. The LIVE string is the lawyer's exact wording and
 * may only be shown when EXPO_PUBLIC_FLAG_PHOTO_STRIP_LIVE=1 (client re-encode
 * and hosted strip-diary-photo are both deployed). The default SOFT string
 * keeps the crop advice and never promises that we remove location data.
 */
export const DIARY_SHARE_PHOTO_WARNING_LIVE =
  'Photos can give away a spot. Signs, gates, parking areas and license plates can show where you were. Crop them out before sharing. We remove location data from the file.';
export const DIARY_SHARE_PHOTO_WARNING_SOFT =
  'Photos can give away a spot. Signs, gates, parking areas and license plates can show where you were. Crop them out before sharing.';

/** Share-sheet "What's shared" box. LIVE promises stripped photos; SOFT does not. */
export const DIARY_SHARE_WHATS_SHARED_LIVE =
  "What's shared: date, species, flushes, hours, birds, dog name, note, and photos with location data removed. Game-land names stay in the app and with your crew.";
export const DIARY_SHARE_WHATS_SHARED_SOFT =
  "What's shared: date, species, flushes, hours, birds, dog name, note, and photos. Game-land names stay in the app and with your crew.";

/** Current photo warning for the share sheet (reads the flag on each call). */
export function diarySharePhotoWarning(): string {
  return flags.photoStripLive ? DIARY_SHARE_PHOTO_WARNING_LIVE : DIARY_SHARE_PHOTO_WARNING_SOFT;
}

/** Current "What's shared" line for the share sheet (reads the flag on each call). */
export function diaryShareWhatsShared(): string {
  return flags.photoStripLive ? DIARY_SHARE_WHATS_SHARED_LIVE : DIARY_SHARE_WHATS_SHARED_SOFT;
}

/** @deprecated Use diarySharePhotoWarning() so the flag is read at render time. */
export const DIARY_SHARE_PHOTO_WARNING = DIARY_SHARE_PHOTO_WARNING_SOFT;
/** @deprecated Use diaryShareWhatsShared() so the flag is read at render time. */
export const DIARY_SHARE_WHATS_SHARED = DIARY_SHARE_WHATS_SHARED_SOFT;
export const DIARY_SHARE_NEVER_SHARED =
  'Never shared: exact location or coordinates, start time, or your track.';
export const DIARY_SHARE_DELAY_NOTE =
  'Delay: the link goes live at midnight Eastern the day after the hunt.';

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
