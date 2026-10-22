import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Backend, Session } from '@/data/backend';
import { addJournalEntry, GUEST_AUTHOR, journalEntries, journalIdle, OWNER_KEY, resetJournalForRestart, syncJournal } from '@/data/journal';
import type { PostDraft } from '@/data/types';
import { getSignal, resetSignal } from '@/lib/connectivity';
import { chipText, copy, pendingHunts, signalBackText } from '@/lib/fieldDraft';

const guest = { id: GUEST_AUTHOR, username: null, displayName: 'You' };
const draft = (caption: string): PostDraft => ({
  species: 'pheasant',
  caption,
  huntedOn: '2026-10-20',
  counts: [{ placeId: null, placeName: 'SGL 211', flushed: 3, roosters: 1, harvested: 1 }],
  exact: null,
  location: 'hidden',
  audience: 'private',
  groupSlug: null,
});
function server(session: () => Session | null, fail?: () => Error | null) {
  const upsertHuntLogEntry = jest.fn(async () => {
    const e = fail?.();
    if (e) throw e;
    return { version: 1, conflict: false };
  });
  return { upsertHuntLogEntry, backend: { getSession: async () => session(), upsertHuntLogEntry } as unknown as Backend };
}
const u1: Session = { userId: 'u1', email: 'a@example.test' };
const u2: Session = { userId: 'u2', email: 'b@example.test' };

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetSignal();
});

describe('field save rules (spec)', () => {
  it('signed out: nothing is uploaded; the hunt stays pending', async () => {
    const s = server(() => null);
    await addJournalEntry(draft('a'), guest);
    await syncJournal(s.backend, { force: true });
    expect(s.upsertHuntLogEntry).not.toHaveBeenCalled();
    expect(await pendingHunts()).toHaveLength(1);
  });

  it('pending hunts attach to the first account that signs in, never a later one', async () => {
    let who: Session | null = u1;
    const s = server(() => who);
    await addJournalEntry(draft('first'), guest);
    await syncJournal(s.backend, { force: true });
    expect(s.upsertHuntLogEntry).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(OWNER_KEY)).toBe(JSON.stringify('u1'));
    expect((await journalEntries())[0].author.id).toBe('u1');

    // u1 signs out, a guest hunt is logged, then a different person signs in.
    who = null;
    await addJournalEntry(draft('second'), guest);
    who = u2;
    await syncJournal(s.backend, { force: true });
    expect(s.upsertHuntLogEntry).toHaveBeenCalledTimes(1);
    expect(await pendingHunts()).toHaveLength(1);
  });

  it('nothing is deleted locally until the server confirms, and synced hunts stay on the phone', async () => {
    let err: Error | null = new Error('Network request failed');
    const s = server(() => u1, () => err);
    await addJournalEntry(draft('keep'), guest);
    await syncJournal(s.backend, { force: true });
    let [e] = await journalEntries();
    expect(e.sync.status).toBe('failed');
    expect(getSignal().online).toBe(false); // the chip shows No signal
    err = null;
    await syncJournal(s.backend, { force: true });
    [e] = await journalEntries();
    expect(e.sync.status).toBe('synced');
    expect(await journalEntries()).toHaveLength(1);
    expect(getSignal()).toEqual({ online: true, back: true }); // chip turns orange
  });

  it('uses the spec copy, with no "Not now"', () => {
    expect(chipText(1)).toBe('1 hunt waiting — sign in');
    expect(chipText(2)).toBe('2 hunts waiting — sign in');
    expect(signalBackText(2)).toBe('Signal back. Sign in to sync 2 hunts');
    expect(copy.waiting).toBe('Waiting to sync');
    expect(JSON.stringify(copy)).not.toMatch(/not now/i);
  });
});
