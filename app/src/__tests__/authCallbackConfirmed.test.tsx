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

describe('auth/callback: already-confirmed account', () => {
  it('sends to sign-in with a friendly message and never crashes', async () => {
    jest.spyOn(backend, 'completeAuthRedirect').mockRejectedValue(new Error('Email already confirmed'));
    await writeAgeGate('passed');
    await addJournalEntry(draft('keep me'), guest);
    await renderRouter('./src/app', { initialUrl: '/auth/callback?code=used' });
    expect(await screen.findByText(/already confirmed/)).toBeTruthy();
    expect((await journalEntries())[0].sync.status).toBe('pending');
  });
});
