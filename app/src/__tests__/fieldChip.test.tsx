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

describe('05/07 pending chip on the map', () => {
  it('shows count + No signal, turns orange when signal returns, and never pops over the map', async () => {
    Object.defineProperty(backend, 'mode', { value: 'supabase', configurable: true });
    await addJournalEntry(draft('waiting'), guest);
    reportSignal(false);
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText(chipText(1))).toBeTruthy();
    expect(screen.getByText(copy.noSignal)).toBeTruthy();
    expect(screen.getByTestId('pending-chip-dot')).toBeTruthy();
    // No popups over the map / trespass banner.
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(screen.queryByTestId('saved-offline-sheet')).toBeNull();

    await act(async () => reportSignal(true));
    expect(await screen.findByText(signalBackText(1) + ' ›')).toBeTruthy();
    expect(screen.queryByTestId('pending-chip-dot')).toBeNull();
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    for (const t of screen.queryAllByTestId('field-toast')) expect(t.parent?.props.pointerEvents).toBe('none');
  });
});
