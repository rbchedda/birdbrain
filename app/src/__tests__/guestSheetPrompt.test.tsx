import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { accountActions, gate, needsAccount } from '@/lib/gate';
import { journalEntries } from '@/data/journal';
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
afterAll(() => AsyncStorage.clear());

describe('first-save sign-in sheet (redesign 02b)', () => {
  it('asks on the first "+ Log hunt" tap only; email is primary while the Apple flag is off', async () => {
    await renderRouter('./src/app', { initialUrl: '/new' });
    await fireEvent.press(await screen.findByTestId('choose-diary'));
    expect(await screen.findByText('Keep your hunt diary')).toBeTruthy();
    expect(screen.getByText('Sign in once so your hunts are backed up and only you can see them. Nothing is posted.')).toBeTruthy();
    expect(screen.queryByText('Continue with Apple')).toBeNull();
    expect(screen.getByText('Continue with email')).toBeTruthy();
    await fireEvent.press(screen.getByText('Not now — keep on this phone only'));
    expect(await screen.findByText('Save hunt')).toBeTruthy();
  });

  it('does not ask again on later taps', async () => {
    await AsyncStorage.setItem('birdbrain.signInPromptSeen.v1', 'true');
    await renderRouter('./src/app', { initialUrl: '/new' });
    await fireEvent.press(await screen.findByTestId('choose-diary'));
    expect(await screen.findByText('Save hunt')).toBeTruthy();
    expect(screen.queryByText('Keep your hunt diary')).toBeNull();
  });
});
