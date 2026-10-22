import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

// Signed out for this whole file (the session store loads once per module).
import { act } from '@testing-library/react-native';
import { journalEntries, journalIdle, syncJournal } from '@/data/journal';
import { heldHunt } from '@/lib/fieldDraft';

let current: Session | null = null;
jest.spyOn(backend, 'getSession').mockImplementation(async () => current);
let emit: (s: Session | null) => void = () => {};
jest.spyOn(backend, 'onSessionChange').mockImplementation((cb: (s: Session | null) => void) => {
  emit = cb;
  return () => {};
});
const me: Session = { userId: 'u1', email: 'a@example.test' };

beforeEach(() => AsyncStorage.clear());
afterAll(async () => {
  await journalIdle();
  await AsyncStorage.clear();
});

describe('field first-save: auto-sync after sign-in', () => {
  it('uploads the held draft once a session exists, marks it synced, never duplicates', async () => {
    const upsert = jest.spyOn(backend, 'upsertHuntLogEntry').mockResolvedValue({ conflict: false, version: 1 } as never);
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    await fireEvent.press(await screen.findByLabelText('Add dog, weather, cover, notes, photo'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Sync me');
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(await screen.findByText('Keep your hunt diary')).toBeTruthy();
    const [held] = await journalEntries();
    expect(upsert).not.toHaveBeenCalled();

    current = me;
    await act(async () => emit(me));
    for (let i = 0; i < 100 && (await journalEntries())[0]?.sync.status !== 'synced'; i++) await act(() => new Promise((r) => setTimeout(r, 30)));
    await journalIdle();
    const after = await journalEntries();
    expect(after).toHaveLength(1);
    expect(after[0].sync.status).toBe('synced');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].clientId).toBe(held.clientId);
    expect(await screen.findByText(/Saved to your private log on this device/)).toBeTruthy();
    expect(await heldHunt()).toBeNull();

    // A later retry (foreground/reconnect) has nothing left to send.
    await syncJournal(backend, { force: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await journalEntries()).toHaveLength(1);
    upsert.mockRestore();
  });
});
