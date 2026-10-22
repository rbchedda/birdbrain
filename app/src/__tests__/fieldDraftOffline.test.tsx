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
import { journalEntries, journalIdle, resetJournalForRestart } from '@/data/journal';
import { confirmPendingText, heldHunt, noSignalText } from '@/lib/fieldDraft';
import { writeAgeGate } from '@/lib/localStore';
import { notNowLabel } from '@/components/SignInSheet';

// Signed out for this whole file (the session store loads once per module).
jest.spyOn(backend, 'getSession').mockResolvedValue(null);
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});

beforeEach(() => AsyncStorage.clear());
afterAll(async () => {
  await journalIdle();
  await AsyncStorage.clear();
});

async function saveHunt(notes: string) {
  await renderRouter('./src/app', { initialUrl: '/new/log' });
  await fireEvent.press(await screen.findByLabelText('Add dog, weather, cover, notes, photo'));
  await fireEvent.changeText(screen.getByLabelText('Notes'), notes);
  await fireEvent.press(screen.getByText('Save hunt'));
  expect(await screen.findByText('Keep your hunt diary')).toBeTruthy();
}

async function signInScreen() {
  await writeAgeGate('passed');
  await renderRouter('./src/app', { initialUrl: '/sign-in' });
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'a@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
}

describe('field first-save: offline draft', () => {
  it('no signal on sign-in shows the exact message and keeps the draft', async () => {
    await saveHunt('No bars');
    screen.unmount();
    const signIn = jest.spyOn(backend, 'signIn').mockRejectedValue(new TypeError('Network request failed'));
    await signInScreen();
    await fireEvent.press(screen.getAllByText('Sign in').at(-1)!);
    expect(await screen.findByText(noSignalText)).toBeTruthy();
    expect(noSignalText).toBe('No signal. Your hunt is saved on this phone, sign in when you have service');
    expect((await journalEntries()).map((e) => e.caption)).toEqual(['No bars']);
    expect(await heldHunt()).not.toBeNull();
    signIn.mockRestore();
  });

  it('email confirmation pending: clear saved-on-phone state, draft kept, shown again on relaunch', async () => {
    await saveHunt('Confirm me');
    screen.unmount();
    const signUp = jest.spyOn(backend, 'signUp').mockResolvedValue({ needsConfirmation: true });
    await signInScreen();
    await fireEvent.press(screen.getByText('New here? Create an account'));
    await fireEvent.press(screen.getAllByText('Create account').at(-1)!);
    expect(await screen.findByText(confirmPendingText)).toBeTruthy();
    expect(confirmPendingText).toMatch(/check your email/i);
    expect(confirmPendingText).toMatch(/hunt is saved on this phone/);
    expect((await heldHunt())?.confirmPending).toBe(true);
    screen.unmount();
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    expect(await screen.findByText(confirmPendingText)).toBeTruthy();
    expect(await journalEntries()).toHaveLength(1);
    signUp.mockRestore();
    screen.unmount();
  });
});
