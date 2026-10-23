import { backend } from '@/data';
import { NOTICE_VERSION } from '@/data/mapNotice';

import { readJson, writeJson } from './localStore';
import { appVersion } from './termsConsent';

/*
 * Dismissible map notice (RBChedda beta-3), behind EXPO_PUBLIC_FLAG_NOTICE_DISMISS and
 * @lawyer's conditions (Oct 23 2026):
 *  1. only a deliberate tap on "Got it" or the close button dismisses it;
 *  2. each dismissal is logged per account (timestamp, app version, notice version);
 *  3. signed-out users can't dismiss it;
 *  5. a new NOTICE_VERSION brings it back.
 * Flag off (default): nothing here is used and nothing is stored.
 */

/** Read at call time so tests can flip it. */
export const noticeDismissEnabled = () => process.env.EXPO_PUBLIC_FLAG_NOTICE_DISMISS === '1';

/** userId → NOTICE_VERSION the account dismissed on this device. */
export const NOTICE_DISMISS_KEY = 'birdbrain.mapNotice.dismissed.v2';

type Dismissals = Record<string, string>;

export async function isNoticeDismissed(userId: string | null | undefined, version = NOTICE_VERSION): Promise<boolean> {
  if (!noticeDismissEnabled() || !userId) return false;
  const all = await readJson<Dismissals>(NOTICE_DISMISS_KEY, {});
  return all?.[userId] === version;
}

/**
 * Log the dismissal to the account first; only once that succeeds is it remembered
 * on the device. Returns false (banner stays) when signed out, the flag is off, or
 * the log write fails.
 */
export type DismissMethod = 'close' | 'got_it';

export async function dismissNoticeFor(
  userId: string | null | undefined,
  version = NOTICE_VERSION,
  method: DismissMethod = 'close',
): Promise<boolean> {
  if (!noticeDismissEnabled() || !userId) return false;
  try {
    await backend.recordNoticeDismissal({ noticeVersion: version, appVersion: appVersion(), method });
  } catch {
    return false;
  }
  const all = (await readJson<Dismissals>(NOTICE_DISMISS_KEY, {})) ?? {};
  await writeJson(NOTICE_DISMISS_KEY, { ...all, [userId]: version });
  return true;
}

/** True when this account dismissed an OLDER notice version: the banner returns labeled "UPDATED NOTICE". */
export async function noticeUpdatedFor(userId: string | null | undefined, version = NOTICE_VERSION): Promise<boolean> {
  if (!noticeDismissEnabled() || !userId) return false;
  const prev = (await readJson<Dismissals>(NOTICE_DISMISS_KEY, {}))?.[userId];
  return !!prev && prev !== version;
}

/** "Show on map" in the full-notice modal: bring the banner back and clear this account's dismissal. */
export async function restoreNoticeFor(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const all = (await readJson<Dismissals>(NOTICE_DISMISS_KEY, {})) ?? {};
  if (!(userId in all)) return;
  const { [userId]: _gone, ...rest } = all;
  await writeJson(NOTICE_DISMISS_KEY, rest);
}
