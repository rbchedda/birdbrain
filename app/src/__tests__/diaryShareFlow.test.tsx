import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Share } from 'react-native';

import { backend } from '@/data';
import { addJournalEntry, journalIdle, resetJournalForRestart, syncJournal } from '@/data/journal';
import type { PostDraft } from '@/data/types';

const FLAG = 'EXPO_PUBLIC_FLAG_DIARY_SHARE';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const me = { id: 'me', username: null, displayName: 'You' };
const draft: PostDraft = {
  species: 'pheasant',
  caption: 'Shared hunt',
  huntedOn: '2026-11-05',
  counts: [],
  exact: null,
  location: 'hidden',
  audience: 'private',
  groupSlug: null,
};

const emptyStatus = {
  shared: false,
  linkId: null,
  createdAt: null,
  expiresAt: null,
  liveAt: null,
  audience: null,
  crewId: null,
  viewCount: 0,
};

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  jest.restoreAllMocks();
  process.env[FLAG] = '1';
});

afterEach(() => {
  delete process.env[FLAG];
});

describe('diary share flag off (default)', () => {
  beforeEach(() => {
    delete process.env[FLAG];
  });

  it('opens an entry with no share UI and zero share RPC calls', async () => {
    const statusSpy = jest.spyOn(backend, 'diaryShareStatus');
    const createSpy = jest.spyOn(backend, 'createDiaryShareLink');
    const revokeSpy = jest.spyOn(backend, 'revokeDiaryShareLink');

    const e = await addJournalEntry(draft, me);
    await syncJournal(backend);
    await renderRouter('./src/app', { initialUrl: `/diary/${e.id}` });

    expect(await screen.findByTestId('page-privacy')).toBeTruthy();
    expect(screen.queryByTestId('diary-share-panel')).toBeNull();
    expect(screen.queryByTestId('diary-share-create')).toBeNull();
    expect(statusSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});

describe('diary share link (sample backend + UI)', () => {
  it('stays private until Share, then status flips and revoke clears it', async () => {
    const e = await addJournalEntry(draft, me);
    await syncJournal(backend);
    const crewId = await backend.createCrew('Share Crew');

    expect(await backend.diaryShareStatus(e.clientId)).toEqual(emptyStatus);

    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
    const link = await backend.createDiaryShareLink(e.clientId, crewId, 30);
    expect(link.token.length).toBeGreaterThan(16);
    expect(await backend.diaryShareStatus(e.clientId)).toMatchObject({
      shared: true,
      linkId: link.linkId,
      audience: 'crew',
      crewId,
      viewCount: 0,
    });

    const link2 = await backend.createDiaryShareLink(e.clientId, crewId);
    expect(link2.token).not.toBe(link.token);
    expect(await backend.diaryShareStatus(e.clientId)).toMatchObject({ shared: true });

    await backend.revokeDiaryShareLink(e.clientId);
    expect(await backend.diaryShareStatus(e.clientId)).toEqual(emptyStatus);

    await renderRouter('./src/app', { initialUrl: `/diary/${e.id}` });
    expect(await screen.findByTestId('diary-share-panel')).toBeTruthy();
    expect(await screen.findByTestId('diary-share-private')).toBeTruthy();
    expect(screen.getByTestId('diary-share-create')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('diary-share-create'));
    expect(await screen.findByTestId('diary-share-sheet')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId(`diary-share-crew-${crewId}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('diary-share-sheet-create'));
    await waitFor(() => expect(screen.getByTestId('diary-share-active')).toBeTruthy());
    expect(shareSpy).toHaveBeenCalled();
    expect(screen.getByTestId('diary-share-url')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('diary-share-revoke'));
    await fireEvent.press(screen.getByTestId('diary-share-revoke-confirm'));
    await waitFor(() => expect(screen.getByTestId('diary-share-private')).toBeTruthy());
  });

  it('createDiaryShareLink requires a backed-up entry on the server', async () => {
    const e = await addJournalEntry(draft, me);
    const crewId = await backend.createCrew('Share Crew');
    await expect(backend.createDiaryShareLink(e.clientId, crewId)).rejects.toThrow(/entry not found/);
    await syncJournal(backend);
    const link = await backend.createDiaryShareLink(e.clientId, crewId);
    expect(link.token.length).toBeGreaterThan(16);
  });

  it('deleting the entry clears the sample share slot', async () => {
    const e = await addJournalEntry(draft, me);
    await syncJournal(backend);
    const crewId = await backend.createCrew('Share Crew');
    await backend.createDiaryShareLink(e.clientId, crewId);
    expect((await backend.diaryShareStatus(e.clientId)).shared).toBe(true);
    await backend.deleteHuntLogEntry(e.clientId);
    expect(await backend.diaryShareStatus(e.clientId)).toEqual(emptyStatus);
  });

  it('status RPC errors leave the entry screen intact', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(backend, 'diaryShareStatus').mockRejectedValue(
      new Error('Could not find the function public.diary_share_status without parameters in the schema cache'),
    );

    const e = await addJournalEntry(draft, me);
    await syncJournal(backend);
    await renderRouter('./src/app', { initialUrl: `/diary/${e.id}` });

    expect(await screen.findByTestId('page-privacy')).toBeTruthy();
    expect(await screen.findByTestId('diary-share-panel')).toBeTruthy();
    expect(await screen.findByTestId('diary-share-private')).toBeTruthy();
    expect(screen.getByText('Edit entry')).toBeTruthy();
    expect(screen.queryByText(/Could not find the function/)).toBeNull();
    warn.mockRestore();
  });
});
