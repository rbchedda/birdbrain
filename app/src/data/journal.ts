import { newClientId, readJson, updateJson, writeJson } from '@/lib/localStore';

import { NotSignedInError, postKind, sumCounts, type Backend, type HuntLogUpload } from './backend';
import type { Author, DiaryDetails, Post, PostDraft } from './types';

/**
 * Private hunt log. Every entry is written to this device first, with a
 * client UUID, so nothing is ever lost offline. A background sync then
 * uploads it to the owner-only hunt_log_entries table (nobody else, and
 * never the public, can read it) using an idempotent upsert by client UUID.
 */
const KEY = 'birdbrain.journal.v2';
const LEGACY_KEY = 'birdbrain.journal.v1';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface SyncState {
  status: SyncStatus;
  /** Server version last confirmed for this entry; null until the first sync succeeds. */
  version: number | null;
  /** Bumped on every local change so a sync that raced an edit doesn't mark it synced. */
  rev: number;
  attempts: number;
  /** Epoch ms before which no retry is attempted (backoff). */
  nextAttemptAt: number;
  error: string | null;
  /** The server copy changed elsewhere; the local copy is kept and not uploaded until edited again. */
  conflict: boolean;
}

export interface JournalEntry extends Post {
  /** Client UUID; also the entry id. */
  clientId: string;
  sync: SyncState;
  /** Rich diary fields; absent on quick log entries. */
  details?: DiaryDetails;
  /**
   * Tombstone: the user deleted this entry. It is hidden everywhere but kept
   * on the device until the server confirms the delete through the queue.
   */
  deleted?: boolean;
}

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
export const backoffMs = (attempts: number) => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

const fresh = (rev = 0): SyncState => ({
  status: 'pending',
  version: null,
  rev,
  attempts: 0,
  nextAttemptAt: 0,
  error: null,
  conflict: false,
});

let migrated: Promise<void> | null = null;
/** One-time import of entries saved before sync existed; they start as pending. */
function migrate() {
  migrated ??= (async () => {
    const legacy = await readJson<Post[] | null>(LEGACY_KEY, null);
    if (!legacy?.length) return;
    await updateJson<JournalEntry[]>(KEY, [], (cur) => [
      ...cur,
      ...legacy.map((p) => {
        const clientId = newClientId();
        return { ...p, id: clientId, clientId, sync: fresh() };
      }),
    ]);
    await writeJson(LEGACY_KEY, []);
  })();
  return migrated;
}

/** Test hook: forget the in-memory migration flag (simulates a fresh app launch). */
export function resetJournalForRestart() {
  migrated = null;
}

/** Every stored entry, tombstones included (the sync queue's view). */
async function allEntries(): Promise<JournalEntry[]> {
  await migrate();
  return readJson<JournalEntry[]>(KEY, []);
}

/** Entries the user sees; deleted ones are hidden while their delete syncs. */
export async function journalEntries(): Promise<JournalEntry[]> {
  return (await allEntries()).filter((e) => !e.deleted);
}

/** Test/diagnostic hook: deletes still waiting for the server. */
export async function pendingDeletes(): Promise<JournalEntry[]> {
  return (await allEntries()).filter((e) => e.deleted);
}

const update = async (fn: (cur: JournalEntry[]) => JournalEntry[]) => {
  await migrate();
  return updateJson<JournalEntry[]>(KEY, [], fn);
};

export async function addJournalEntry(draft: PostDraft, me: Author, details?: DiaryDetails): Promise<JournalEntry> {
  const clientId = newClientId();
  const entry: JournalEntry = {
    id: clientId,
    clientId,
    author: me,
    mine: true,
    kind: postKind(draft),
    species: draft.species,
    caption: draft.caption,
    createdAt: new Date().toISOString(),
    publicAfter: null,
    huntedOn: draft.huntedOn,
    location: 'hidden',
    area: null,
    counts: sumCounts(draft.counts),
    placeCounts: draft.counts,
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: fresh(),
    ...(details ? { details } : {}),
  };
  await update((cur) => [entry, ...cur]);
  notify(true);
  return entry;
}

export type JournalEdit = Partial<Pick<PostDraft, 'species' | 'caption' | 'huntedOn' | 'counts'>> & { details?: DiaryDetails };

/** Edit locally; the change is queued and synced against the last known server version. */
export async function editJournalEntry(id: string, edit: JournalEdit) {
  await update((cur) =>
    cur.map((e) => {
      if (e.id !== id) return e;
      const placeCounts = edit.counts ?? e.placeCounts ?? [];
      return {
        ...e,
        species: edit.species !== undefined ? edit.species : e.species,
        caption: edit.caption ?? e.caption,
        huntedOn: edit.huntedOn ?? e.huntedOn,
        placeCounts,
        counts: sumCounts(placeCounts),
        kind: placeCounts.some((c) => c.harvested > 0) || edit.details?.birds.some((b) => b.count > 0) ? 'harvest' : 'hunt',
        ...(edit.details ? { details: edit.details } : {}),
        sync: { ...fresh(e.sync.rev + 1), version: e.sync.version },
      };
    }),
  );
  notify(true);
}

/** Removes the entry from this device. (Server-side deletion is not part of P0.8.) */
/**
 * Delete an entry everywhere. It becomes a tombstone that the sync queue
 * deletes on the server (owner-only RLS, idempotent); only then is it dropped
 * from the device. Nothing is lost if the app closes or is offline meanwhile.
 */
export async function removeJournalEntry(id: string) {
  await update((cur) => cur.map((e) => (e.id === id ? { ...e, deleted: true, sync: { ...fresh(e.sync.rev + 1), version: e.sync.version } } : e)));
  notify(true);
}

const toUpload = (e: JournalEntry): HuntLogUpload => ({
  clientId: e.clientId,
  baseVersion: e.sync.version,
  species: e.species,
  caption: e.caption,
  huntedOn: e.huntedOn,
  placeCounts: e.placeCounts ?? [],
  // Only storage paths leave the device; local file URIs never do.
  details: e.details ? { ...e.details, photos: e.details.photos.map((p) => ({ id: p.id, path: p.path })) } : null,
});

/** Upload photos that have no storage path yet; records each path as soon as it lands. */
async function uploadPhotos(backend: Backend, e: JournalEntry): Promise<JournalEntry> {
  const missing = (e.details?.photos ?? []).filter((p) => !p.path && p.localUri);
  if (!missing.length) return e;
  const paths = new Map<string, string>();
  for (const p of missing) {
    paths.set(p.id, await backend.uploadDiaryPhoto(e.clientId, { id: p.id, localUri: p.localUri! }));
    // Recording a path is not a content edit, so it applies whatever the rev.
    await update((cur) =>
      cur.map((x) =>
        x.id === e.id && x.details
          ? { ...x, details: { ...x.details, photos: x.details.photos.map((ph) => (paths.has(ph.id) ? { ...ph, path: paths.get(ph.id)! } : ph)) } }
          : x,
      ),
    );
  }
  return { ...e, details: { ...e.details!, photos: e.details!.photos.map((ph) => (paths.has(ph.id) ? { ...ph, path: paths.get(ph.id)! } : ph)) } };
}

/**
 * Apply a sync result. If the entry was edited during the upload (rev moved on)
 * only the confirmed server version is kept, so the edit stays pending and its
 * next upload is based on the version the server actually has.
 */
const patchSync = (id: string, rev: number, patch: Partial<SyncState>, confirmedVersion?: number) =>
  update((cur) =>
    cur.map((e) => {
      if (e.id !== id) return e;
      if (e.sync.rev === rev) return { ...e, sync: { ...e.sync, ...patch } };
      return confirmedVersion === undefined ? e : { ...e, sync: { ...e.sync, version: confirmedVersion } };
    }),
  );

export interface SyncOptions {
  now?: () => number;
  /** Ignore backoff (explicit "retry now", reconnect). */
  force?: boolean;
}

export interface SyncReport {
  synced: number;
  failed: number;
  conflicts: number;
  skipped: number;
}

let inFlight: Promise<SyncReport> | null = null;

/** Resolves once no sync is running. */
export async function journalIdle() {
  while (inFlight) await inFlight.catch(() => undefined);
}

/**
 * Upload every pending/failed entry that is due. Concurrent calls share one
 * run, and the server upsert is idempotent by client UUID, so double syncs
 * never create duplicates.
 */
export function syncJournal(backend: Backend, opts: SyncOptions = {}): Promise<SyncReport> {
  inFlight ??= runSync(backend, opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(backend: Backend, { now = Date.now, force = false }: SyncOptions): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, failed: 0, conflicts: 0, skipped: 0 };
  // Signed out (hybrid guest mode): entries stay on this phone; nothing goes to the server.
  if (typeof backend.getSession === 'function' && !(await backend.getSession().catch(() => null))) return report;
  const due = (await allEntries()).filter(
    (e) => e.sync.status !== 'synced' && (e.deleted || !e.sync.conflict) && (force || e.sync.nextAttemptAt <= now()),
  );
  for (const e of due) {
    try {
      if (e.deleted) {
        await backend.deleteHuntLogEntry(e.clientId);
        report.synced++;
        await update((cur) => cur.filter((x) => !(x.id === e.id && x.deleted)));
        continue;
      }
      const ready = await uploadPhotos(backend, e);
      const res = await backend.upsertHuntLogEntry(toUpload(ready));
      if (res.conflict) {
        report.conflicts++;
        await patchSync(e.id, e.sync.rev, {
          status: 'failed',
          conflict: true,
          error: 'Changed on another device. Edit this entry to keep your version.',
          version: res.version,
        });
      } else {
        report.synced++;
        await patchSync(e.id, e.sync.rev, { status: 'synced', version: res.version, attempts: 0, nextAttemptAt: 0, error: null }, res.version);
      }
    } catch (err) {
      if (err instanceof NotSignedInError) {
        // Not a failure: stays pending until the user signs in.
        report.skipped++;
        continue;
      }
      report.failed++;
      const attempts = e.sync.attempts + 1;
      await patchSync(e.id, e.sync.rev, {
        status: 'failed',
        attempts,
        nextAttemptAt: now() + backoffMs(attempts),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  notify();
  return report;
}

// --- change notifications for screens -------------------------------------

const listeners = new Set<() => void>();
const queuedListeners = new Set<() => void>();
function notify(queued = false) {
  listeners.forEach((l) => l());
  if (queued) queuedListeners.forEach((l) => l());
}
export function onJournalChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// --- automatic retries ---------------------------------------------------

export interface SyncTriggers {
  /** Subscribe to "app came to the foreground". */
  onForeground(cb: () => void): () => void;
  /** Subscribe to "network came back". */
  onReconnect(cb: () => void): () => void;
}

/**
 * Sync now, then again on foreground, on reconnect, and when the earliest
 * backoff expires. Returns a stop function.
 */
export function startJournalSync(backend: Backend, triggers: SyncTriggers): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const schedule = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    // Signed out: nothing uploads, so don't spin on due retries (sign-in or a new entry restarts it).
    if (typeof backend.getSession === 'function' && !(await backend.getSession().catch(() => null))) return;
    if (stopped) return;
    const waiting = (await allEntries()).filter((e) => e.sync.status === 'failed' && (e.deleted || !e.sync.conflict));
    if (!waiting.length || stopped) return;
    const next = Math.min(...waiting.map((e) => e.sync.nextAttemptAt));
    timer = setTimeout(run, Math.max(0, next - Date.now()));
  };
  const run = (force: boolean | unknown = false) => {
    syncJournal(backend, { force: force === true })
      .catch(() => undefined)
      .then(schedule);
  };
  const subs = [
    triggers.onForeground(() => run()),
    triggers.onReconnect(() => run(true)),
    // A new or edited entry uploads right away.
    (queuedListeners.add(run), () => queuedListeners.delete(run)),
  ];
  run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    subs.forEach((u) => u());
  };
}
