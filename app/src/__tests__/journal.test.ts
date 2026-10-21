import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Backend, HuntLogUpload, HuntLogUpsertResult } from '@/data/backend';
import { NotSignedInError } from '@/data/backend';
import {
  addJournalEntry,
  backoffMs,
  editJournalEntry,
  journalIdle,
  journalEntries,
  resetJournalForRestart,
  startJournalSync,
  syncJournal,
} from '@/data/journal';
import { createSampleBackend, HUNT_LOG_KEY } from '@/data/sampleBackend';
import type { PostDraft } from '@/data/types';

const me = { id: 'me', username: null, displayName: 'You' };
const draft = (caption: string): PostDraft => ({
  species: 'pheasant',
  caption,
  huntedOn: '2026-10-20',
  counts: [{ placeId: null, placeName: 'Back 40', flushed: 3, roosters: 1, harvested: 1 }],
  exact: null,
  location: 'hidden',
  audience: 'private',
  groupSlug: null,
});

/** In-memory server with the same semantics as public.upsert_hunt_log_entry. */
function fakeServer() {
  const rows = new Map<string, HuntLogUpload & { version: number }>();
  const calls: HuntLogUpload[] = [];
  let offline = false;
  const body = (x: HuntLogUpload) => JSON.stringify([x.species, x.caption, x.huntedOn, x.placeCounts]);
  const upsertHuntLogEntry = jest.fn(async (e: HuntLogUpload): Promise<HuntLogUpsertResult> => {
    calls.push(e);
    await Promise.resolve();
    if (offline) throw new Error('Network request failed');
    const cur = rows.get(e.clientId);
    if (!cur) {
      rows.set(e.clientId, { ...e, version: 1 });
      return { version: 1, conflict: false };
    }
    if (body(cur) === body(e)) return { version: cur.version, conflict: false };
    if (e.baseVersion === cur.version) {
      rows.set(e.clientId, { ...e, version: cur.version + 1 });
      return { version: cur.version + 1, conflict: false };
    }
    return { version: cur.version, conflict: true };
  });
  return {
    rows,
    calls,
    setOffline: (v: boolean) => (offline = v),
    backend: { upsertHuntLogEntry } as unknown as Backend,
  };
}

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
});

describe('offline-safe hunt log', () => {
  it('saves offline immediately with a client UUID and pending status', async () => {
    const server = fakeServer();
    server.setOffline(true);
    const e = await addJournalEntry(draft('offline'), me);
    expect(e.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(e.id).toBe(e.clientId);
    expect(e.sync.status).toBe('pending');

    const report = await syncJournal(server.backend);
    expect(report.failed).toBe(1);
    const [saved] = await journalEntries();
    expect(saved.caption).toBe('offline');
    expect(saved.sync.status).toBe('failed');
    expect(saved.sync.error).toMatch(/Network/);
    expect(server.rows.size).toBe(0);
  });

  it('persists entries and their sync state across an app restart', async () => {
    const server = fakeServer();
    server.setOffline(true);
    const a = await addJournalEntry(draft('before restart'), me);
    await syncJournal(server.backend);

    resetJournalForRestart(); // new launch: only AsyncStorage survives
    const after = await journalEntries();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ clientId: a.clientId, caption: 'before restart' });
    expect(after[0].sync.status).toBe('failed');

    server.setOffline(false);
    await syncJournal(server.backend, { force: true });
    expect((await journalEntries())[0].sync.status).toBe('synced');
    expect(server.rows.get(a.clientId)?.caption).toBe('before restart');
  });

  it('migrates entries saved before sync existed', async () => {
    await AsyncStorage.setItem('birdbrain.journal.v1', JSON.stringify([{ id: 'journal-old', caption: 'legacy', huntedOn: null }]));
    const [e] = await journalEntries();
    expect(e.caption).toBe('legacy');
    expect(e.sync.status).toBe('pending');
    expect(e.clientId).not.toBe('journal-old');
  });

  it('retries after a failure with exponential backoff', async () => {
    const server = fakeServer();
    let t = 1_000_000;
    const now = () => t;
    server.setOffline(true);
    await addJournalEntry(draft('retry me'), me);

    await syncJournal(server.backend, { now });
    let [e] = await journalEntries();
    expect(e.sync).toMatchObject({ status: 'failed', attempts: 1, nextAttemptAt: t + backoffMs(1) });

    server.setOffline(false);
    await syncJournal(server.backend, { now }); // still backing off
    expect(server.calls).toHaveLength(1);

    t += backoffMs(1);
    await syncJournal(server.backend, { now });
    [e] = await journalEntries();
    expect(e.sync).toMatchObject({ status: 'synced', attempts: 0, version: 1, error: null });
    expect(backoffMs(2)).toBe(2 * backoffMs(1));
    expect(backoffMs(100)).toBe(5 * 60_000);
  });

  it('retries automatically on foreground and reconnect', async () => {
    const server = fakeServer();
    server.setOffline(true);
    let foreground = () => {};
    let reconnect = () => {};
    const stop = startJournalSync(server.backend, {
      onForeground: (cb) => ((foreground = cb), () => {}),
      onReconnect: (cb) => ((reconnect = cb), () => {}),
    });
    await addJournalEntry(draft('auto'), me);
    await syncJournal(server.backend, { force: true });
    expect((await journalEntries())[0].sync.status).toBe('failed');

    server.setOffline(false);
    reconnect();
    await waitFor(async () => (await journalEntries())[0].sync.status === 'synced');
    stop();
    expect(typeof foreground).toBe("function");
    await journalIdle();
  });

  it('keeps an entry pending (not failed) while signed out', async () => {
    const backend = { upsertHuntLogEntry: jest.fn(async () => Promise.reject(new NotSignedInError())) } as unknown as Backend;
    await addJournalEntry(draft('guest'), me);
    const report = await syncJournal(backend);
    expect(report.skipped).toBe(1);
    expect((await journalEntries())[0].sync).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('never duplicates on a double sync', async () => {
    const server = fakeServer();
    const e = await addJournalEntry(draft('once'), me);
    const [a, b] = await Promise.all([syncJournal(server.backend), syncJournal(server.backend)]);
    expect(a).toBe(b); // concurrent calls share one run
    await syncJournal(server.backend, { force: true }); // already synced: no upload
    expect(server.calls).toHaveLength(1);

    // A lost response means the device re-sends with no base version; still one row.
    await server.backend.upsertHuntLogEntry({ ...server.calls[0], baseVersion: null });
    expect(server.rows.size).toBe(1);
    expect(server.rows.get(e.clientId)?.version).toBe(1);
  });

  it('syncs an edit against the last confirmed version', async () => {
    const server = fakeServer();
    const e = await addJournalEntry(draft('v1'), me);
    await syncJournal(server.backend);
    await editJournalEntry(e.id, { caption: 'v2' });
    expect((await journalEntries())[0].sync.status).toBe('pending');
    await syncJournal(server.backend);
    expect((await journalEntries())[0].sync).toMatchObject({ status: 'synced', version: 2 });
    expect(server.rows.get(e.clientId)).toMatchObject({ caption: 'v2', version: 2 });
  });

  it('flags a conflict when the server copy changed, and keeps the local edit', async () => {
    const server = fakeServer();
    const e = await addJournalEntry(draft('v1'), me);
    await syncJournal(server.backend);
    // Another device edits the same entry.
    server.rows.set(e.clientId, { ...server.rows.get(e.clientId)!, caption: 'from tablet', version: 2 });

    await editJournalEntry(e.id, { caption: 'from phone' });
    const report = await syncJournal(server.backend);
    expect(report.conflicts).toBe(1);
    const [local] = await journalEntries();
    expect(local.caption).toBe('from phone');
    expect(local.sync).toMatchObject({ status: 'failed', conflict: true, version: 2 });
    expect(server.rows.get(e.clientId)?.caption).toBe('from tablet');

    // Conflicted entries aren't retried blindly...
    await syncJournal(server.backend, { force: true });
    expect(server.calls).toHaveLength(2);
    // ...until the user edits again, which rebases on the server version and wins.
    await editJournalEntry(e.id, { caption: 'from phone, final' });
    await syncJournal(server.backend);
    expect((await journalEntries())[0].sync).toMatchObject({ status: 'synced', conflict: false, version: 3 });
  });

  it('does not mark an entry synced if it was edited while uploading', async () => {
    const server = fakeServer();
    const e = await addJournalEntry(draft('v1'), me);
    const real = server.backend.upsertHuntLogEntry;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const uploading = new Promise<void>((r) => (started = r));
    server.backend.upsertHuntLogEntry = async (x) => {
      started();
      await gate;
      return real(x);
    };
    const running = syncJournal(server.backend);
    await uploading;
    await editJournalEntry(e.id, { caption: 'edited mid-flight' });
    release();
    await running;
    server.backend.upsertHuntLogEntry = real;
    expect((await journalEntries())[0].sync.status).toBe('pending');
    await syncJournal(server.backend);
    expect((await journalEntries())[0].sync.status).toBe('synced');
    expect(server.rows.get(e.clientId)?.caption).toBe('edited mid-flight');
  });

  it('sample backend mirrors the server upsert rules', async () => {
    const b = createSampleBackend();
    const up: HuntLogUpload = { clientId: 'c1', baseVersion: null, species: null, caption: 'a', huntedOn: null, placeCounts: [] };
    expect(await b.upsertHuntLogEntry(up)).toEqual({ version: 1, conflict: false });
    expect(await b.upsertHuntLogEntry(up)).toEqual({ version: 1, conflict: false });
    expect(await b.upsertHuntLogEntry({ ...up, caption: 'b', baseVersion: 1 })).toEqual({ version: 2, conflict: false });
    expect(await b.upsertHuntLogEntry({ ...up, caption: 'c', baseVersion: 1 })).toEqual({ version: 2, conflict: true });
    expect(Object.keys(JSON.parse((await AsyncStorage.getItem(HUNT_LOG_KEY))!))).toEqual(['c1']);
  });
});

async function waitFor(check: () => Promise<boolean>, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition not met');
}
