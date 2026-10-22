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

describe('field first-save: relaunch', () => {
  it('survives an app kill: the sheet and the one entry come back on relaunch, no duplicate', async () => {
    await saveHunt('Kill me');
    const [before] = await journalEntries();
    screen.unmount();
    resetJournalForRestart();
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    expect(await screen.findByText('Keep your hunt diary')).toBeTruthy();
    expect(screen.getByText(/is held on this phone/)).toBeTruthy();
    expect(screen.queryByText(notNowLabel)).toBeNull();
    const after = await journalEntries();
    expect(after).toHaveLength(1);
    expect(after[0].clientId).toBe(before.clientId);
  });
});
