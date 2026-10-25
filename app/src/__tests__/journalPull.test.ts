import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Backend, HuntLogUpload, HuntLogUpsertResult, ServerHuntLog } from '@/data/backend';
import {
  addJournalEntry,
  entriesForAccount,
  getPullState,
  journalEntries,
  journalIdle,
  mergeServerHunts,
  PULLED_KEY,
  pullJournal,
  removeJournalEntry,
  resetJournalForRestart,
  resetPullState,
  syncJournal,
} from '@/data/journal';
import { createSupabaseBackend } from '@/data/supabaseBackend';
import { buildStats } from '@/data/statsCharts';
import { emptyDiaryDetails, type PostDraft } from '@/data/types';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const me = { id: 'me', username: null, displayName: 'You' };
const draft = (caption: string, huntedOn = '2026-10-20'): PostDraft => ({
  species: 'pheasant',
  caption,
  huntedOn,
  counts: [{ placeId: null, placeName: 'SGL 211', flushed: 3, roosters: 1, harvested: 1 }],
  exact: null,
  location: 'hidden',
  audience: 'private',
  groupSlug: null,
});

const row = (n: number, over: Partial<ServerHuntLog> = {}): ServerHuntLog => ({
  clientId: `00000000-0000-4000-8000-00000000000${n}`,
  version: 1,
  species: 'pheasant',
  caption: `server ${n}`,
  huntedOn: `2026-10-0${n}`,
  placeCounts: [{ placeId: null, placeName: 'SGL 211', flushed: 2, roosters: 1, harvested: 1 }],
  createdAt: `2026-10-0${n}T15:00:00.000Z`,
  details: null,
  ...over,
});

function server(rows: ServerHuntLog[], opts: { signedIn?: boolean } = {}) {
  const state = { rows: [...rows], fail: null as Error | null, signedIn: opts.signedIn ?? true };
  const uploads: HuntLogUpload[] = [];
  const listHuntLogEntries = jest.fn(async () => {
    if (state.fail) throw state.fail;
    return state.rows;
  });
  const backend = {
    getSession: async () => (state.signedIn ? { userId: USER } : null),
    listHuntLogEntries,
    upsertHuntLogEntry: jest.fn(async (e: HuntLogUpload): Promise<HuntLogUpsertResult> => {
      uploads.push(e);
      state.rows.push({ ...row(9), clientId: e.clientId, caption: e.caption, huntedOn: e.huntedOn, placeCounts: e.placeCounts });
      return { version: 1, conflict: false };
    }),
  } as unknown as Backend;
  return { state, backend, listHuntLogEntries, uploads };
}

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetPullState();
});

describe('restore on a fresh install', () => {
  it('brings the account\'s hunts back as synced entries, with no duplicates on repeat', async () => {
    const s = server([row(1), row(2), row(3, { details: { ...emptyDiaryDetails(), species: ['pheasant'], flushes: 7, hours: 3, birds: [{ species: 'pheasant', count: 2, roosters: 2, hens: 0 }] } })]);
    expect(await journalEntries()).toHaveLength(0);

    const report = await pullJournal(s.backend, { force: true });
    expect(report).toMatchObject({ status: 'ok', restored: 3 });
    const entries = await journalEntries();
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.sync.status === 'synced' && e.sync.version === 1 && e.mine && e.author.id === USER)).toBe(true);
    expect(entries.find((e) => e.caption === 'server 3')?.details?.flushes).toBe(7);
    expect(await AsyncStorage.getItem(PULLED_KEY)).toContain(USER);
    expect(getPullState()).toMatchObject({ phase: 'ok', restored: 3, pulledFor: USER });

    const again = await pullJournal(s.backend, { force: true });
    expect(again.restored).toBe(0);
    expect(await journalEntries()).toHaveLength(3);
    // Nothing is uploaded back: restored hunts are already saved.
    expect(s.uploads).toHaveLength(0);
  });

  it('computes the same stats from restored hunts', async () => {
    const s = server([row(1), row(2, { huntedOn: '2026-10-02' }), row(3, { huntedOn: '2026-10-02' })]);
    await pullJournal(s.backend, { force: true });
    const entries = await journalEntries();
    const model = buildStats(entries, '2026-27', { today: '2026-10-24', lookup: () => undefined, roster: [], woodcockSeparate: false });
    expect(model.tiles.days).toBe(2);
    expect(model.tiles.flushes).toBe(6);
  });
});

describe('merge with local-only hunts', () => {
  it('keeps unsynced local hunts, adds server ones, never doubles an id', async () => {
    const s = server([row(1), row(2)]);
    await syncJournal(s.backend).catch(() => undefined); // signed in, nothing yet
    const local = await addJournalEntry(draft('only here'), { ...me, id: USER });
    // an edit made offline on a hunt that also exists on the server
    s.state.rows.push(row(4, { clientId: local.clientId, caption: 'stale server copy' }));
    const report = await pullJournal(s.backend, { force: true });
    expect(report.restored).toBe(2);
    const entries = await journalEntries();
    expect(entries).toHaveLength(3);
    const mineOnly = entries.find((e) => e.clientId === local.clientId)!;
    expect(mineOnly.caption).toBe('only here'); // pending local work wins
    expect(new Set(entries.map((e) => e.clientId)).size).toBe(entries.length);
  });

  it('takes a newer server version only for an entry with nothing waiting to sync', () => {
    const base = mergeServerHunts([], [row(1)], USER, new Set()).entries[0];
    const pending = { ...base, sync: { ...base.sync, status: 'pending' as const } };
    expect(mergeServerHunts([pending], [row(1, { version: 5, caption: 'new' })], USER, new Set()).entries[0].caption).toBe('server 1');
    const m = mergeServerHunts([base], [row(1, { version: 5, caption: 'new' })], USER, new Set([base.clientId]));
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]).toMatchObject({ caption: 'new', sync: { version: 5, status: 'synced' } });
    expect(m.updated).toBe(1);
  });

  it('drops a synced hunt deleted on another phone, but only when the server answered with data', () => {
    const [a, b] = mergeServerHunts([], [row(1), row(2)], USER, new Set()).entries;
    const ids = new Set([a.clientId, b.clientId]);
    const m = mergeServerHunts([a, b], [row(1)], USER, ids);
    expect(m.entries.map((e) => e.clientId)).toEqual([a.clientId]);
    expect(m.removed).toBe(1);
    // an empty answer never wipes the phone
    expect(mergeServerHunts([a, b], [], USER, ids).entries).toHaveLength(2);
    // a hunt that finished uploading after the pull began is not in the answer and is kept
    expect(mergeServerHunts([a, b], [row(1)], USER, new Set([a.clientId])).entries).toHaveLength(2);
  });

  it('does not bring back a hunt deleted here while its delete is still queued', async () => {
    const s = server([row(1)]);
    await pullJournal(s.backend, { force: true });
    const [e] = await journalEntries();
    await removeJournalEntry(e.clientId);
    await pullJournal(s.backend, { force: true });
    expect(await journalEntries()).toHaveLength(0);
  });
});

describe('guest mode', () => {
  it('signed out: no pull, hunts stay local, nothing is requested from the server', async () => {
    const s = server([row(1)], { signedIn: false });
    await addJournalEntry(draft('on this phone'), me);
    const report = await pullJournal(s.backend, { force: true });
    expect(report.status).toBe('skipped');
    expect(s.listHuntLogEntries).not.toHaveBeenCalled();
    const entries = await journalEntries();
    expect(entries.map((e) => e.caption)).toEqual(['on this phone']);
    expect(entriesForAccount(entries, null, null)).toHaveLength(1);
  });

  it('an account sees its own hunts plus guest hunts waiting for it, not another account\'s', () => {
    const [a] = mergeServerHunts([], [row(1)], USER, new Set()).entries;
    const [b] = mergeServerHunts([], [row(2)], OTHER, new Set()).entries;
    const guest = { ...a, clientId: 'g', id: 'g', author: me };
    expect(entriesForAccount([a, b, guest], USER, null).map((e) => e.clientId)).toEqual([a.clientId, 'g']);
    expect(entriesForAccount([a, b, guest], USER, OTHER).map((e) => e.clientId)).toEqual([a.clientId]);
  });
});

describe('offline or failing pull', () => {
  it('keeps every local hunt and reports failure', async () => {
    const s = server([row(1)]);
    await pullJournal(s.backend, { force: true });
    const before = await journalEntries();
    s.state.fail = new Error('Network request failed');
    const report = await pullJournal(s.backend, { force: true });
    expect(report.status).toBe('failed');
    expect(getPullState().phase).toBe('failed');
    expect(await journalEntries()).toEqual(before);
  });

  it('a first pull that fails restores nothing and leaves the account marked as still owed', async () => {
    const s = server([row(1)]);
    s.state.fail = new Error('boom');
    await pullJournal(s.backend, { force: true });
    expect(await journalEntries()).toHaveLength(0);
    expect(await AsyncStorage.getItem(PULLED_KEY)).toBeNull();
    s.state.fail = null;
    await pullJournal(s.backend, { force: true });
    expect(await journalEntries()).toHaveLength(1);
  });

  it('is throttled unless forced, and tolerates a backend without the call', async () => {
    const s = server([row(1)]);
    await pullJournal(s.backend, { force: true });
    expect((await pullJournal(s.backend)).status).toBe('skipped');
    expect(s.listHuntLogEntries).toHaveBeenCalledTimes(1);
    expect((await pullJournal({} as Backend)).status).toBe('skipped');
  });
});

describe('supabase listHuntLogEntries', () => {
  it('reads only the signed-in owner\'s rows, embeds diary details and pages through the table', async () => {
    const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ client_id: `c${from + i}`, species: 'grouse', caption: '', hunted_on: '2026-10-01', place_counts: [], version: 2, created_at: '2026-10-01T00:00:00Z', diary_entries: from + i === 0 ? [{ details: { flushes: 4 } }] : null }));
    const calls: unknown[] = [];
    const pages = [page(500, 0), page(3, 500)];
    const q: Record<string, jest.Mock> = { eq: jest.fn(() => q), order: jest.fn(() => q), range: jest.fn(async (a: number, b: number) => (calls.push([a, b]), { data: pages.shift(), error: null })) };
    const select = jest.fn(() => q);
    const sb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: USER } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from: jest.fn(() => ({ select })),
    } as unknown as SupabaseClient;
    const out = await createSupabaseBackend(sb).listHuntLogEntries();
    expect(out).toHaveLength(503);
    expect(calls).toEqual([[0, 499], [500, 999]]);
    expect(q.eq).toHaveBeenCalledWith('owner_id', USER);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('diary_entries(details)'));
    expect(out[0]).toMatchObject({ clientId: 'c0', version: 2, details: { flushes: 4 } });
    expect(out[1].details).toBeNull();
  });
});
