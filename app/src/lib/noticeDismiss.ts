import { Platform } from 'react-native';

import { backend } from '@/data';
import { NOTICE_VERSION } from '@/data/mapNotice';

import { readJson, writeJson } from './localStore';
import { appVersion } from './termsConsent';

/*
 * Dismissible map notice, Option A (HANDOFF §2, counsel-approved Oct 23 2026), behind
 * EXPO_PUBLIC_FLAG_NOTICE_DISMISS. Flag off (default): nothing here runs or stores anything.
 *
 *  - Only the banner close button ('close') or "Got it" in the full notice ('got_it') dismisses.
 *  - Dismissal is remembered per owner (an account id, or DEVICE when signed out) and per
 *    NOTICE_VERSION, saved on the phone at once, and queued for notice_acknowledgements.
 *    The queue survives offline and is sent when a real account is signed in; a signed-out
 *    dismissal moves to the account at sign-in.
 *  - "Show on map" clears it (logged as kind 'notice_restore').
 *  - Cross-device: at sign-in the account's latest server row for this version wins.
 *  - A NOTICE_VERSION bump brings the banner back with "UPDATED NOTICE".
 * Server columns method/platform/dismissed_at/client_id need migration 20261029000000.
 */

export const noticeDismissEnabled = () => process.env.EXPO_PUBLIC_FLAG_NOTICE_DISMISS === '1';

/** Owner key for a signed-out device. */
export const DEVICE = '__device__';
/** owner → NOTICE_VERSION dismissed. */
export const NOTICE_DISMISS_KEY = 'birdbrain.mapNotice.dismissed.v2';
/** owner → last NOTICE_VERSION seen dismissed (kept after a restore/bump, drives "UPDATED NOTICE"). */
const SEEN_KEY = 'birdbrain.mapNotice.seen.v1';
export const NOTICE_QUEUE_KEY = 'birdbrain.mapNotice.queue.v1';

export type DismissMethod = 'close' | 'got_it';
export interface NoticeEvent {
  clientId: string;
  owner: string;
  kind: 'notice_dismiss' | 'notice_restore';
  method: DismissMethod | 'show_on_map';
  noticeVersion: string;
  appVersion: string;
  platform: string;
  at: string;
}

type Map = Record<string, string>;
const ownerOf = (owner: string | null | undefined) => owner || DEVICE;

export const newClientId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

export async function isNoticeDismissed(owner: string | null | undefined, version = NOTICE_VERSION): Promise<boolean> {
  if (!noticeDismissEnabled()) return false;
  const all = await readJson<Map>(NOTICE_DISMISS_KEY, {});
  return all?.[ownerOf(owner)] === version;
}

/** The owner dismissed an OLDER version: the banner returns labeled "UPDATED NOTICE". */
export async function noticeUpdatedFor(owner: string | null | undefined, version = NOTICE_VERSION): Promise<boolean> {
  if (!noticeDismissEnabled()) return false;
  const prev = (await readJson<Map>(SEEN_KEY, {}))?.[ownerOf(owner)];
  return !!prev && prev !== version;
}

async function setLocal(owner: string, version: string | null) {
  const all = (await readJson<Map>(NOTICE_DISMISS_KEY, {})) ?? {};
  if (version) {
    all[owner] = version;
    const seen = (await readJson<Map>(SEEN_KEY, {})) ?? {};
    await writeJson(SEEN_KEY, { ...seen, [owner]: version });
  } else delete all[owner];
  await writeJson(NOTICE_DISMISS_KEY, all);
}

async function enqueue(e: Omit<NoticeEvent, 'clientId' | 'appVersion' | 'platform' | 'at'>, now: Date) {
  const q = (await readJson<NoticeEvent[]>(NOTICE_QUEUE_KEY, [])) ?? [];
  q.push({ ...e, clientId: newClientId(), appVersion: appVersion(), platform: Platform.OS, at: now.toISOString() });
  await writeJson(NOTICE_QUEUE_KEY, q);
}

/** Close button / "Got it". Saved on the phone at once (works offline and signed out), then synced. */
export async function dismissNoticeFor(
  owner: string | null | undefined,
  version = NOTICE_VERSION,
  method: DismissMethod = 'close',
  now = new Date(),
): Promise<boolean> {
  if (!noticeDismissEnabled()) return false;
  const o = ownerOf(owner);
  await setLocal(o, version);
  await enqueue({ owner: o, kind: 'notice_dismiss', method, noticeVersion: version }, now);
  void flushNoticeQueue();
  return true;
}

/** "Show on map": bring the banner back and clear the dismissal (synced too). */
export async function restoreNoticeFor(owner: string | null | undefined, version = NOTICE_VERSION, now = new Date()) {
  if (!noticeDismissEnabled()) return;
  const o = ownerOf(owner);
  await setLocal(o, null);
  await enqueue({ owner: o, kind: 'notice_restore', method: 'show_on_map', noticeVersion: version }, now);
  void flushNoticeQueue();
}

let flushing: Promise<number> | null = null;
/** Send queued events for the signed-in account. Failures stay queued. Returns how many were sent. */
export function flushNoticeQueue(): Promise<number> {
  if (!noticeDismissEnabled()) return Promise.resolve(0);
  flushing ??= (async () => {
    try {
      const session = await backend.getSession().catch(() => null);
      if (!session || session.anonymous) return 0;
      const q = (await readJson<NoticeEvent[]>(NOTICE_QUEUE_KEY, [])) ?? [];
      const done = new Set<string>();
      for (const e of q) {
        if (e.owner !== session.userId) continue;
        try {
          await backend.recordNoticeDismissal({
            noticeVersion: e.noticeVersion,
            appVersion: e.appVersion,
            method: e.method,
            kind: e.kind,
            platform: e.platform,
            at: e.at,
            clientId: e.clientId,
          });
          done.add(e.clientId);
        } catch {
          // stays queued
        }
      }
      const now = (await readJson<NoticeEvent[]>(NOTICE_QUEUE_KEY, [])) ?? [];
      await writeJson(NOTICE_QUEUE_KEY, now.filter((e) => !done.has(e.clientId)));
      return done.size;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/**
 * After a real account signs in: a signed-out dismissal on this phone moves to the account
 * (and its queued events upload), then the account's latest server state for this version
 * is applied, so a dismissal follows the user to a new device.
 */
export async function syncNoticeOnSignIn(userId: string, version = NOTICE_VERSION): Promise<void> {
  if (!noticeDismissEnabled()) return;
  if (flushing) await flushing.catch(() => 0);
  const q = (await readJson<NoticeEvent[]>(NOTICE_QUEUE_KEY, [])) ?? [];
  if (q.some((e) => e.owner === DEVICE)) {
    await writeJson(NOTICE_QUEUE_KEY, q.map((e) => (e.owner === DEVICE ? { ...e, owner: userId } : e)));
  }
  const local = (await readJson<Map>(NOTICE_DISMISS_KEY, {})) ?? {};
  if (local[DEVICE] && !local[userId]) await setLocal(userId, local[DEVICE]);
  await flushNoticeQueue();
  // Anything still queued is newer than the server; only pull when the queue is empty for this user.
  const left = ((await readJson<NoticeEvent[]>(NOTICE_QUEUE_KEY, [])) ?? []).some((e) => e.owner === userId);
  if (left) return;
  const latest = await backend.latestNoticeAction(version).catch(() => undefined);
  if (latest === undefined) return; // offline: keep what the phone has
  if (latest === 'notice_dismiss') await setLocal(userId, version);
  else if (latest === 'notice_restore') await setLocal(userId, null);
}

/** For tests. */
export function resetNoticeCache() {
  flushing = null;
}
