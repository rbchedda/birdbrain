import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { accountActions, gate, needsAccount } from '@/lib/gate';
import { journalEntries } from '@/data/journal';
import { acceptTerms, getConsent, syncConsentOnSignIn } from '@/lib/consent';

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
afterAll(() => AsyncStorage.clear());

describe('first-save sign-in sheet (redesign 02b)', () => {
  it('saves the held entry the moment sign-in completes', async () => {
    let emit: (s: Session | null) => void = () => {};
    (backend.onSessionChange as jest.Mock).mockImplementation((cb: (s: Session | null) => void) => {
      emit = cb;
      return () => {};
    });
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'Held');
    await fireEvent.press(screen.getByText('Save to diary'));
    await fireEvent.press(await screen.findByText('Continue with email'));
    expect((await getConsent()).state).toBe('accepted');
    expect(await journalEntries()).toHaveLength(0);
    // The hooks store subscribed at first use; emit a sign-in through every listener we can reach.
    const { act } = require('@testing-library/react-native');
    await act(async () => emit(me));
    await waitFor(async () => expect((await journalEntries()).map((e) => e.caption)).toEqual(['Held']), { timeout: 3000 });
  });
});
