import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
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

describe('consent sync on sign-in', () => {
  it('sign-in screen calls syncConsentOnSignIn after a successful sign-in', async () => {
    await acceptTerms();
    const record = jest.spyOn(backend, 'recordTermsAcceptance').mockResolvedValue(undefined);
    jest.spyOn(backend, 'signIn').mockImplementation(async () => {
      getSession.mockResolvedValue(me);
    });
    await renderRouter('./src/app', { initialUrl: '/sign-in' });
    await fireEvent.changeText(await screen.findByLabelText('Birth year'), '1990');
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.changeText(await screen.findByLabelText('Email'), 'a@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
    await fireEvent.press(screen.getAllByText('Sign in').at(-1)!);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect((await getConsent()).pendingSync).toBe(0);
    getSession.mockResolvedValue(null);
    record.mockRestore();
  });
});
