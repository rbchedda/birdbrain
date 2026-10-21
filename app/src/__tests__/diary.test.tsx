import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { Backend, HuntLogUpload } from '@/data/backend';
import { listDogs, removeDog, saveDog } from '@/data/dogs';
import { addJournalEntry, journalEntries, journalIdle, resetJournalForRestart, syncJournal } from '@/data/journal';
import { HUNT_LOG_KEY } from '@/data/sampleBackend';
import { emptyDiaryDetails, type DiaryDetails, type PostDraft } from '@/data/types';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const me = { id: 'me', username: null, displayName: 'You' };
const draft: PostDraft = {
  species: 'pheasant',
  caption: 'Ruby pinned two in the corn',
  huntedOn: '2026-10-24',
  counts: [],
  exact: null,
  location: 'hidden',
  audience: 'private',
  groupSlug: null,
};
const rich = (): DiaryDetails => ({
  ...emptyDiaryDetails(),
  startTime: '07:30',
  species: ['pheasant'],
  dogs: [{ dogId: 'd1', name: 'Ruby', points: 3, flushes: 4, retrieves: 2 }],
  cover: ['standing_corn'],
  hours: 3.5,
  miles: 4,
  flushes: 6,
  shots: 5,
  birds: [{ species: 'pheasant', count: 2, roosters: 2, hens: 0 }],
  weather: { tempF: 41, windMph: 8, windDir: 'NW', sky: 'overcast', precip: null },
  photos: [{ id: 'p1', localUri: 'file:///photos/p1.jpg', path: null }],
});

function fakeServer() {
  const rows = new Map<string, HuntLogUpload>();
  const uploads: string[] = [];
  let offline = false;
  const backend = {
    upsertHuntLogEntry: jest.fn(async (e: HuntLogUpload) => {
      if (offline) throw new Error('Network request failed');
      const cur = rows.get(e.clientId);
      if (cur && JSON.stringify(cur) === JSON.stringify({ ...e, baseVersion: cur.baseVersion })) return { version: 1, conflict: false };
      rows.set(e.clientId, e);
      return { version: cur ? 2 : 1, conflict: false };
    }),
    uploadDiaryPhoto: jest.fn(async (clientId: string, p: { id: string; localUri: string }) => {
      if (offline) throw new Error('Network request failed');
      uploads.push(p.localUri);
      return `uid/${clientId}/${p.id}.jpg`;
    }),
  } as unknown as Backend;
  return { rows, uploads, backend, setOffline: (v: boolean) => (offline = v) };
}

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
});

describe('rich diary entries through the offline queue', () => {
  it('round trips offline: saved locally, survives restart, syncs details and photos once', async () => {
    const server = fakeServer();
    server.setOffline(true);
    const e = await addJournalEntry(draft, me, rich());
    await syncJournal(server.backend);
    expect((await journalEntries())[0].sync.status).toBe('failed');
    expect(server.rows.size).toBe(0);

    resetJournalForRestart();
    expect((await journalEntries())[0].details).toEqual(rich());

    server.setOffline(false);
    await syncJournal(server.backend, { force: true });
    await syncJournal(server.backend, { force: true });
    const [local] = await journalEntries();
    expect(local.sync.status).toBe('synced');
    expect(local.details?.photos[0]).toEqual({ id: 'p1', localUri: 'file:///photos/p1.jpg', path: `uid/${e.clientId}/p1.jpg` });
    expect(server.uploads).toEqual(['file:///photos/p1.jpg']);
    const sent = server.rows.get(e.clientId)!;
    expect(sent.details).toMatchObject({ dogs: rich().dogs, cover: ['standing_corn'], shots: 5, flushes: 6, hours: 3.5 });
    // Local file URIs never leave the device; only the private storage path does.
    expect(sent.details?.photos).toEqual([{ id: 'p1', path: `uid/${e.clientId}/p1.jpg` }]);
  });

  it('round trips online through the sample backend', async () => {
    const { backend } = jest.requireActual('@/data') as { backend: Backend };
    const e = await addJournalEntry(draft, me, rich());
    await syncJournal(backend);
    expect((await journalEntries())[0].sync).toMatchObject({ status: 'synced', version: 1 });
    const stored = JSON.parse((await AsyncStorage.getItem(HUNT_LOG_KEY))!)[e.clientId];
    expect(stored.details.birds).toEqual(rich().birds);
  });

  it('keeps a failed photo upload pending for retry without losing the entry', async () => {
    const server = fakeServer();
    (server.backend.uploadDiaryPhoto as jest.Mock).mockRejectedValueOnce(new Error('upload failed'));
    await addJournalEntry(draft, me, rich());
    await syncJournal(server.backend);
    let [e] = await journalEntries();
    expect(e.sync).toMatchObject({ status: 'failed', error: 'upload failed' });
    expect(server.rows.size).toBe(0);
    await syncJournal(server.backend, { force: true });
    [e] = await journalEntries();
    expect(e.sync.status).toBe('synced');
  });
});

describe('dog roster', () => {
  it('saves, renames and removes dogs on the device', async () => {
    const ruby = await saveDog({ name: ' Ruby ', breed: 'GSP' });
    expect(ruby).toMatchObject({ name: 'Ruby', breed: 'GSP' });
    await saveDog({ id: ruby.id, name: 'Ruby Jean' });
    expect((await listDogs()).map((d) => d.name)).toEqual(['Ruby Jean']);
    await removeDog(ruby.id);
    expect(await listDogs()).toEqual([]);
    await expect(saveDog({ name: '  ' })).rejects.toThrow(/name/);
  });
});

describe('diary screens', () => {
  it('logs a detailed entry and shows it with its backup status, then edits it', async () => {
    await renderRouter('./src/app', { initialUrl: '/diary/new' });
    await fireEvent.changeText(await screen.findByLabelText('Place'), 'SGL 156');
    await fireEvent.press(screen.getByText('Pheasant'));
    await fireEvent.changeText(screen.getByLabelText('New dog name'), 'Ruby');
    await fireEvent.press(screen.getByText('Add dog'));
    await fireEvent.press(await screen.findByLabelText('More ruby points'));
    await fireEvent.press(screen.getByText('Standing corn'));
    await fireEvent.changeText(screen.getByLabelText('Hours hunted'), '3.5');
    await fireEvent.press(screen.getByLabelText('More shots'));
    await fireEvent.press(screen.getByLabelText('More roosters bagged'));
    await fireEvent.changeText(screen.getByLabelText('Temperature'), '41');
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Cold start');
    await fireEvent.press(screen.getByText('Save to diary'));

    expect(await screen.findByText('Backed up')).toBeTruthy();
    expect(screen.getByText('SGL 156')).toBeTruthy();
    expect(screen.getByText('Standing corn')).toBeTruthy();
    expect(screen.getByText('3.5 h · 0 flushes · 1 shots')).toBeTruthy();
    expect(screen.getByText(/Pheasant 1 \(1 roosters, 0 hens\)/)).toBeTruthy();
    expect(screen.getByText('1 points · 0 flushes · 0 retrieves')).toBeTruthy();
    expect(screen.getByText('41°F')).toBeTruthy();

    await fireEvent.press(screen.getByText('Edit entry'));
    await fireEvent.press(await screen.findByLabelText('More flushes'));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('3.5 h · 1 flushes · 1 shots')).toBeTruthy();
    await waitFor(async () => expect((await journalEntries())[0].sync).toMatchObject({ status: 'synced', version: 2 }));
  });

  it('rejects impossible hours', async () => {
    await renderRouter('./src/app', { initialUrl: '/diary/new' });
    await fireEvent.changeText(await screen.findByLabelText('Hours hunted'), '30');
    await fireEvent.press(screen.getByText('Save to diary'));
    expect(await screen.findByText(/Hours should be a number/)).toBeTruthy();
    expect(await journalEntries()).toEqual([]);
  });
});
