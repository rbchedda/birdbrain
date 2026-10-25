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

const USER = '11111111-1111-4111-8111-111111111111';
jest.spyOn(backend, 'getSession').mockResolvedValue({ userId: USER, email: 'a@example.test' });
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});

const row = (n: number, flushed: number): ServerHuntLog => {
  const d = new Date();
  const ymd = todayET();
  return {
    clientId: `00000000-0000-4000-8000-00000000000${n}`,
    version: 1,
    species: 'pheasant',
    caption: '',
    huntedOn: `${ymd.slice(0, 8)}${String(Math.max(1, Number(ymd.slice(8)) - n)).padStart(2, '0')}`,
    placeCounts: [{ placeId: null, placeName: 'SGL 211', flushed, roosters: 0, harvested: 0 }],
    createdAt: d.toISOString(),
    details: null,
  };
};

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetPullState();
  jest.restoreAllMocks();
  jest.spyOn(backend, 'getSession').mockResolvedValue({ userId: USER, email: 'a@example.test' });
  jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});
});

describe('Stats restored from the account', () => {
  it('fresh install: waits for the pull, then shows stats built from the saved hunts (no empty flash, no duplicates)', async () => {
    let release!: (r: ServerHuntLog[]) => void;
    const list = jest.spyOn(backend, 'listHuntLogEntries').mockReturnValue(new Promise((r) => (release = r)));
    await open('/profile/stats');
    expect(await screen.findByTestId('stats-loading')).toBeTruthy();
    expect(screen.queryByTestId('stats-empty')).toBeNull();
    expect(screen.queryByTestId('stats-guest-note')).toBeNull();

    release([row(1, 3), row(2, 4), row(3, 5)]);
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
    expect(screen.getByLabelText('3 days afield')).toBeTruthy();
    expect(screen.getByLabelText('12 flushes')).toBeTruthy();
    expect(screen.queryByTestId('stats-restoring')).toBeNull();
    expect(screen.queryByText(/reinstall/i)).toBeNull();
    expect(await journalEntries()).toHaveLength(3);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('merges with hunts that were only on this phone', async () => {
    // A server that keeps what this phone uploads, like the real one.
    const server = [row(1, 3), row(2, 4)];
    jest.spyOn(backend, 'listHuntLogEntries').mockImplementation(async () => server);
    jest.spyOn(backend, 'upsertHuntLogEntry').mockImplementation(async (e) => {
      server.push({ ...row(5, 2), clientId: e.clientId, huntedOn: e.huntedOn, placeCounts: e.placeCounts });
      return { version: 1, conflict: false };
    });
    await addJournalEntry(
      { species: 'pheasant', caption: '', huntedOn: row(5, 0).huntedOn as string, counts: [{ placeId: null, placeName: 'Back 40', flushed: 2, roosters: 0, harvested: 0 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
      { id: USER, username: null, displayName: 'You' },
    );
    await open('/profile/stats');
    expect(await screen.findByLabelText('3 days afield')).toBeTruthy();
    expect(screen.getByLabelText('9 flushes')).toBeTruthy();
    expect(await journalEntries()).toHaveLength(3);
  });

  it('offline: shows the hunts on this phone, a try-again note, and recovers', async () => {
    const list = jest.spyOn(backend, 'listHuntLogEntries').mockRejectedValue(new Error('Network request failed'));
    await open('/profile/stats');
    expect(await screen.findByTestId('stats-restore-failed')).toBeTruthy();
    expect(screen.getByText(/Stats use the hunts on this phone for now/)).toBeTruthy();
    list.mockResolvedValue([row(1, 6)]);
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByLabelText('6 flushes')).toBeTruthy());
    expect(screen.queryByTestId('stats-restore-failed')).toBeNull();
  });
});
