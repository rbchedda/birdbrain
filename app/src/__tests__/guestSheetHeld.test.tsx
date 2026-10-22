import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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
  it('holds the entry on Save; "Not now" keeps it on the phone and sends nothing', async () => {
    const upsert = jest.spyOn(backend, 'upsertHuntLogEntry');
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'Cold start');
    await fireEvent.press(screen.getByText('Save to diary'));
    expect(await screen.findByText('Keep your hunt diary')).toBeTruthy();
    expect(screen.getByText(/is held on this phone and saves the moment you sign in/)).toBeTruthy();
    expect(await journalEntries()).toHaveLength(0);
    await fireEvent.press(screen.getByText('Not now — keep on this phone only'));
    await waitFor(async () => expect(await journalEntries()).toHaveLength(1));
    expect(upsert).not.toHaveBeenCalled();
    upsert.mockRestore();
  });
});
