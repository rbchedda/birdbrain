import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { ServerHuntLog } from '@/data/backend';
import { addJournalEntry, journalIdle, resetJournalForRestart, resetPullState } from '@/data/journal';
import { emptyDiaryDetails } from '@/data/types';
import { todayET } from '@/lib/time';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });
const me = { id: 'me', username: null, displayName: 'You' };

const USER = '11111111-1111-4111-8111-111111111111';
jest.spyOn(backend, 'getSession').mockResolvedValue({ userId: USER, email: 'a@example.test' });
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});
jest.spyOn(backend, 'listHuntLogEntries').mockResolvedValue([]);

const hunt = (place: string, flushed: number, hours = 2) =>
  addJournalEntry(
    { species: 'pheasant', caption: '', huntedOn: todayET(), counts: [{ placeId: null, placeName: place, flushed, roosters: 0, harvested: 0 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
    me,
    { ...emptyDiaryDetails(), species: ['pheasant'], flushes: flushed, hours },
  );

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetPullState();
});

describe('Profile › Stats section', () => {
  it('shows a live private preview of this season with a clear "See all stats" button', async () => {
    await hunt('SGL 211', 11, 3);
    await open('/profile');
    const section = await screen.findByTestId('profile-stats-section');
    expect(section).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Stats' })).toBeTruthy();
    expect(screen.getByText(/Only you/)).toBeTruthy();
    expect(await screen.findByTestId('profile-stats-live')).toBeTruthy();
    expect(screen.getByLabelText('1 days afield')).toBeTruthy();
    expect(screen.getByLabelText('11 flushes')).toBeTruthy();
    expect(screen.getByLabelText('3 hours')).toBeTruthy();
    expect(screen.getByLabelText('1 game lands')).toBeTruthy();
    expect(screen.queryByTestId('profile-stats-sample')).toBeNull();
    expect(screen.queryByText('SAMPLE DATA')).toBeNull();
    expect(screen.queryByTestId('profile-stats-guest-note')).toBeNull();
    expect(screen.queryByText(/\blat\b|\blng\b|latitude|longitude/i)).toBeNull();
    // Still on the Profile page alongside the diary.
    expect(screen.getByText('Hunt diary')).toBeTruthy();
  });

  it('"See all stats" opens the full Stats page', async () => {
    await hunt('SGL 211', 4);
    await open('/profile');
    await fireEvent.press(await screen.findByTestId('profile-stats-see-all'));
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
    expect(screen.getByTestId('season-stats')).toBeTruthy();
    expect(screen.getByLabelText('1 days afield')).toBeTruthy();
  });

  it('no hunts this season: a labelled SAMPLE preview, "Log your first hunt", and still a way into Stats', async () => {
    await open('/profile');
    expect(await screen.findByTestId('profile-stats-sample')).toBeTruthy();
    expect(screen.getByText('SAMPLE DATA')).toBeTruthy();
    expect(screen.getByTestId('profile-stats-empty-copy')).toBeTruthy();
    expect(screen.getByLabelText('118 flushes')).toBeTruthy();
    expect(screen.getByText(/Only you/)).toBeTruthy();
    expect(screen.queryByTestId('profile-stats-live')).toBeNull();
    await fireEvent.press(screen.getAllByText('Log your first hunt')[0]);
    expect(await screen.findByText(/Private diary entry · not a post/)).toBeTruthy();
  });

  it('empty state "See all stats" still opens the Stats page', async () => {
    await open('/profile');
    await fireEvent.press(await screen.findByTestId('profile-stats-see-all'));
    expect(await screen.findByTestId('stats-empty')).toBeTruthy();
  });

  it('signed in on a fresh install: numbers come from the account restore (same code as Stats), no duplicates', async () => {
    const d = new Date();
    const rows: ServerHuntLog[] = [1, 2].map((n) => ({
      clientId: `00000000-0000-4000-8000-00000000000${n}`,
      version: 1,
      deleted: false,
      species: 'pheasant',
      caption: '',
      huntedOn: todayET().slice(0, 8) + String(n).padStart(2, '0'),
      placeCounts: [{ placeId: null, placeName: 'SGL 211', flushed: 5, roosters: 0, harvested: 0 }],
      createdAt: d.toISOString(),
      details: null,
    })) as unknown as ServerHuntLog[];
    (backend.listHuntLogEntries as jest.Mock).mockResolvedValueOnce(rows);
    await open('/profile');
    await waitFor(() => expect(screen.getByTestId('profile-stats-live')).toBeTruthy());
    expect(await screen.findByLabelText('10 flushes')).toBeTruthy();
    expect(screen.getByLabelText('2 days afield')).toBeTruthy();
  });
});
