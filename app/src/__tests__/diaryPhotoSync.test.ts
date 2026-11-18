import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Backend, HuntLogUpload } from '@/data/backend';
import { addJournalEntry, journalIdle, resetJournalForRestart, syncJournal } from '@/data/journal';
import { emptyDiaryDetails } from '@/data/types';

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
});

describe('diary photo sync', () => {
  it('an offline diary photo uploads later with its MIME type; only the storage path leaves the device', async () => {
    let offline = true;
    const uploads: { localUri: string; mimeType?: string | null }[] = [];
    const upserts: HuntLogUpload[] = [];
    const fake = {
      uploadDiaryPhoto: async (clientId: string, p: { id: string; localUri: string; mimeType?: string | null }) => {
        if (offline) throw new Error('Network request failed');
        uploads.push({ localUri: p.localUri, mimeType: p.mimeType });
        return `uid/${clientId}/${p.id}.png`;
      },
      upsertHuntLogEntry: async (u: HuntLogUpload) => {
        upserts.push(u);
        return { version: 1, conflict: false };
      },
    } as unknown as Backend;
    await journalIdle();
    resetJournalForRestart();
    const e = await addJournalEntry(
      { species: null, caption: 'Pic', huntedOn: '2026-11-17', counts: [], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
      { id: 'me', username: null, displayName: 'You' },
      { ...emptyDiaryDetails(), photos: [{ id: 'ph1', localUri: 'file:///docs/photos/ph1.png', mimeType: 'image/png', path: null }] },
    );
    await journalIdle();
    await syncJournal(fake, { force: true });
    expect(upserts).toEqual([]);
    offline = false;
    await syncJournal(fake, { force: true });
    expect(uploads).toEqual([{ localUri: 'file:///docs/photos/ph1.png', mimeType: 'image/png' }]);
    expect(upserts[0].details!.photos).toEqual([{ id: 'ph1', path: `uid/${e.clientId}/ph1.png` }]);
  });
});
