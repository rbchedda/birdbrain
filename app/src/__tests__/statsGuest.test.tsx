import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { ServerHuntLog } from '@/data/backend';
import { addJournalEntry, journalEntries, journalIdle, resetJournalForRestart, resetPullState } from '@/data/journal';
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

describe('Stats as a guest', () => {
  it('shows an empty season with a sign-in note, and never asks the server for hunts', async () => {
    await open('/profile/stats');
    expect(await screen.findByTestId('stats-empty')).toBeTruthy();
    expect(screen.getByText('Your season starts here')).toBeTruthy();
    expect(screen.getByText('Log your first hunt')).toBeTruthy();
    expect(screen.getByTestId('stats-guest-note')).toBeTruthy();
    expect(screen.getByText(/On this phone only\./)).toBeTruthy();
    expect(screen.queryByText(/reinstall/i)).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('computes stats from this phone\'s hunts only', async () => {
    await addJournalEntry(
      { species: 'pheasant', caption: '', huntedOn: todayET(), counts: [{ placeId: null, placeName: 'SGL 211', flushed: 4, roosters: 1, harvested: 1 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
      { id: 'me', username: null, displayName: 'You' },
    );
    await open('/profile/stats');
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
    expect(screen.getByLabelText('1 days afield')).toBeTruthy();
    expect(screen.getByLabelText('4 flushes')).toBeTruthy();
    expect(screen.getByTestId('stats-guest-note')).toBeTruthy();
    expect(screen.getByText(/Sign in to save them to your account/)).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });
});
