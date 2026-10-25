import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { addJournalEntry, journalIdle, resetJournalForRestart, resetPullState } from '@/data/journal';
import { todayET } from '@/lib/time';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

// Signed out for this whole file (the session store loads once per module).
jest.spyOn(backend, 'getSession').mockResolvedValue(null);
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});
const list = jest.spyOn(backend, 'listHuntLogEntries');

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetPullState();
});

describe('Profile › Stats section as a guest', () => {
  it('shows this phone\'s hunts with a note that signing in saves stats to the account, and never asks the server', async () => {
    await addJournalEntry(
      { species: 'pheasant', caption: '', huntedOn: todayET(), counts: [{ placeId: null, placeName: 'SGL 211', flushed: 4, roosters: 0, harvested: 0 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
      { id: 'me', username: null, displayName: 'You' },
    );
    await open('/profile');
    expect(await screen.findByTestId('profile-stats-live')).toBeTruthy();
    expect(screen.getByLabelText('4 flushes')).toBeTruthy();
    expect(screen.getByTestId('profile-stats-guest-note')).toHaveTextContent(/On this phone only\. Sign in to save your stats to your account\./);
    expect(list).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('profile-stats-see-all'));
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
  });

  it('guest with no hunts gets the sample preview and the log button', async () => {
    await open('/profile');
    expect(await screen.findByTestId('profile-stats-sample')).toBeTruthy();
    expect(screen.getByText('SAMPLE DATA')).toBeTruthy();
    expect(screen.getAllByText('Log your first hunt').length).toBeGreaterThan(0);
  });
});
