import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { addJournalEntry, GUEST_AUTHOR, journalEntries, journalIdle, resetJournalForRestart } from '@/data/journal';
import type { PostDraft } from '@/data/types';
import { reportSignal, resetSignal } from '@/lib/connectivity';
import { chipText, copy, resetFieldForRestart, signalBackText } from '@/lib/fieldDraft';
import { writeAgeGate } from '@/lib/localStore';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

let current: Session | null = null;
jest.spyOn(backend, 'getSession').mockImplementation(async () => current);
let emit: (s: Session | null) => void = () => {};
jest.spyOn(backend, 'onSessionChange').mockImplementation((cb: (s: Session | null) => void) => {
  emit = cb;
  return () => {};
});
void emit;
const upsert = jest.spyOn(backend, 'upsertHuntLogEntry').mockResolvedValue({ conflict: false, version: 1 } as never);
const guest = { id: GUEST_AUTHOR, username: null, displayName: 'You' };
const draft = (caption: string): PostDraft => ({
  species: 'pheasant', caption, huntedOn: '2026-10-20',
  counts: [{ placeId: null, placeName: 'SGL 211', flushed: 3, roosters: 1, harvested: 1 }],
  exact: null, location: 'hidden', audience: 'private', groupSlug: null,
});
void draft; void addJournalEntry; void chipText; void signalBackText; void reportSignal; void waitFor; void act; void writeAgeGate; void copy;
const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));
void settle;

beforeEach(async () => {
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetFieldForRestart();
  resetSignal();
  upsert.mockClear();
});
afterAll(async () => {
  await journalIdle();
  await AsyncStorage.clear();
});
const saveHunt = async (notes: string) => {
  await fireEvent.press(await screen.findByLabelText('Add dog, weather, cover, notes, photo'));
  await fireEvent.changeText(screen.getByLabelText('Notes'), notes);
  await fireEvent.press(screen.getByText('Save hunt'));
};
void saveHunt;

describe('auth/callback success', () => {
  it('exchanges the PKCE code, syncs pending hunts and lands on the map', async () => {
    const done = jest.spyOn(backend, 'completeAuthRedirect').mockImplementation(async () => {
      current = { userId: 'u1', email: 'a@example.test' };
    });
    await addJournalEntry(draft('from the field'), guest);
    await renderRouter('./src/app', { initialUrl: '/auth/callback?code=abc123' });
    await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ code: 'abc123' })));
    expect(await screen.findByText(/Save 1 hunt from this phone to a@example.test\?/)).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Save to this account'));
    expect(await screen.findByText(copy.savedToAccount)).toBeTruthy();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await journalEntries()).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('auth-callback')).toBeNull());
  });

  it('"Not my account" signs out and keeps the hunts on the phone, uploading nothing', async () => {
    jest.spyOn(backend, 'completeAuthRedirect').mockImplementation(async () => {
      current = { userId: 'u2', email: 'x@example.test' };
    });
    const out = jest.spyOn(backend, 'signOut').mockImplementation(async () => { current = null; });
    await addJournalEntry(draft('mine'), guest);
    await renderRouter('./src/app', { initialUrl: '/auth/callback?code=evil' });
    await fireEvent.press(await screen.findByText('Not my account'));
    await waitFor(() => expect(out).toHaveBeenCalled());
    expect(upsert).not.toHaveBeenCalled();
    expect(await journalEntries()).toHaveLength(1);
  });

  it('a raw-token link is refused (PKCE only)', async () => {
    const real = jest.spyOn(backend, 'completeAuthRedirect').mockRejectedValue(new Error('This sign-in link is missing its code.'));
    await addJournalEntry(draft('keep'), guest);
    await renderRouter('./src/app', { initialUrl: '/auth/callback#access_token=a&refresh_token=b' });
    await waitFor(() => expect(real).toHaveBeenCalled());
    expect(upsert).not.toHaveBeenCalled();
  });
});
