import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { accountActions, gate, needsAccount } from '@/lib/gate';
import { journalEntries, journalIdle } from '@/data/journal';
import { acceptTerms, getConsent, syncConsentOnSignIn } from '@/lib/termsConsent';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

// Signed out for this whole file (the session store loads once per module).
const getSession = jest.spyOn(backend, 'getSession').mockResolvedValue(null);
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});

const me: Session = { userId: 'u1', email: 'a@example.test' };

beforeEach(() => AsyncStorage.clear());
afterAll(async () => {
  await journalIdle();
  await AsyncStorage.clear();
});

describe('first-save sign-in sheet (redesign 02b)', () => {
  it('persists the hunt before the sheet opens; the first-save sheet has no "Not now"', async () => {
    const upsert = jest.spyOn(backend, 'upsertHuntLogEntry');
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    await fireEvent.press(await screen.findByLabelText('Add dog, weather, cover, notes, photo'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Cold start');
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(await screen.findByText('Keep your hunt diary')).toBeTruthy();
    // Already on the phone (idempotent client UUID) by the time the sheet shows.
    const [e] = await journalEntries();
    expect(e.caption).toBe('Cold start');
    expect(e.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.sync.status).toBe('pending');
    expect(JSON.parse((await AsyncStorage.getItem('birdbrain.heldHunt.v1'))!).id).toBe(e.id);
    expect(screen.queryByText('Not now — keep on this phone only')).toBeNull();
    expect(screen.getByText('Continue with email')).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
    upsert.mockRestore();
  });
});
