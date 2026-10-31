import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

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

const hunt = (species: 'pheasant' | 'dove', place: string) =>
  addJournalEntry(
    { species, caption: '', huntedOn: todayET(), counts: [{ placeId: null, placeName: place, flushed: 2, roosters: 0, harvested: 0 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
    me,
    { ...emptyDiaryDetails(), species: [species], flushes: 2, hours: 2 },
  );

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetPullState();
});

const ROWS = [
  ['menu-hunt-log', 'Hunt log', '/profile/hunt-log'],
  ['menu-stats', 'Stats', '/profile/stats'],
  ['menu-dogs', 'Dogs', '/profile/dogs'],
  ['menu-plans', 'Plans', '/profile/plans'],
] as const;

describe('Profile is a menu', () => {
  it('lists Hunt log, Stats, Dogs and Plans as four tappable rows in order, keeps Settings and the Stats preview', async () => {
    await open('/profile');
    const menu = await screen.findByTestId('profile-menu');
    const rows = within(menu).getAllByRole('button');
    expect(rows).toHaveLength(4);
    ROWS.forEach(([, label], i) => expect(rows[i].props.accessibilityLabel).toMatch(new RegExp(`^${label}\\. `)));
    expect(screen.getByLabelText('Settings')).toBeTruthy();
    // No hunts yet: one "Your season starts here" card instead of the stats preview (review T1).
    expect(screen.getByTestId('profile-season-starts')).toBeTruthy();
    expect(screen.queryByTestId('profile-stats-section')).toBeNull();
  });

  it('has no tab row, tablist or swipe pager', async () => {
    await open('/profile');
    await screen.findByTestId('profile-menu');
    expect(screen.queryByRole('tablist')).toBeNull();
    // Only the app's bottom tab bar has tabs (Map, Feed, Guide, Profile); none are Hunt log, Stats, Dogs or Plans.
    expect(screen.queryAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Map', 'Feed', 'Guide', 'Profile']);
  });

  it.each(ROWS)('%s pushes %s as its own full-screen page with a back arrow, and Back returns to the menu', async (testID, label, path) => {
    await open('/profile');
    await fireEvent.press(await screen.findByTestId(testID));
    expect(screen).toHavePathname(path);
    expect(await screen.findByLabelText('Back')).toBeTruthy();
    expect(screen.getAllByRole('header').some((h) => h.props.children === label)).toBe(true);
    // The old Hunt log | Stats | Dogs | Plans row is gone from every sub page.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByTestId('profile-menu')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByTestId('profile-menu')).toBeTruthy();
    expect(screen).toHavePathname('/profile');
  });

  it.each(ROWS)('deep link %s opens directly, and Back with no history goes to Profile', async (_id, _label, path) => {
    await open(path);
    expect(await screen.findByLabelText('Back')).toBeTruthy();
    expect(screen).toHavePathname(path);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByTestId('profile-menu')).toBeTruthy();
    expect(screen).toHavePathname('/profile');
  });

  it('the summaries are live: hunt count on the Hunt log row', async () => {
    await hunt('pheasant', 'SGL 211');
    await open('/profile');
    expect(await screen.findByLabelText(/^Hunt log\. 1 hunt · private diary/)).toBeTruthy();
  });

  it('"See all stats" in the preview and the Stats row open the same Stats page', async () => {
    await hunt('pheasant', 'SGL 211');
    await open('/profile');
    await fireEvent.press(await screen.findByTestId('profile-stats-see-all'));
    expect(screen).toHavePathname('/profile/stats');
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('Stats → a chart → "See these hunts in your log" opens the filtered Hunt log with a Clear chip; Back returns to the chart, then Stats, then Profile', async () => {
    for (const [sp, place] of [['pheasant', 'SGL 211'], ['pheasant', 'SGL 148'], ['pheasant', 'Back 40'], ['dove', 'Cornfield']] as const) await hunt(sp, place);
    await open('/profile');
    await fireEvent.press(await screen.findByTestId('menu-stats'));
    await fireEvent.press(await screen.findByLabelText('Details: What you hunted'));
    expect(screen).toHavePathname('/profile/stats/species');
    await fireEvent.press(await screen.findByLabelText(/^Dove, /));
    await fireEvent.press(await screen.findByText('See these hunts in your log ›'));
    expect(screen).toHavePathname('/profile/hunt-log');
    expect(await screen.findByText(/Dove · 1 hunt/)).toBeTruthy();
    expect(screen.getByText(/Cornfield/)).toBeTruthy();
    expect(screen.queryByText(/Back 40/)).toBeNull();
    // Clear chip removes the filter and stays on the Hunt log page.
    await fireEvent.press(screen.getByText(/Dove · 1 hunt/));
    expect(await screen.findByText(/Back 40/)).toBeTruthy();
    expect(screen).toHavePathname('/profile/hunt-log');
    // Back unwinds one page at a time.
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByText('See these hunts in your log ›')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByTestId('profile-menu')).toBeTruthy();
  });

  it('opening an entry from the Hunt log and going Back lands on the Hunt log, not a tab row', async () => {
    await hunt('pheasant', 'SGL 211');
    await open('/profile');
    await fireEvent.press(await screen.findByTestId('menu-hunt-log'));
    await fireEvent.press(await screen.findByText(/SGL 211/));
    expect(await screen.findByText('Delete entry')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByTestId('hunt-log-list')).toBeTruthy();
    expect(screen).toHavePathname('/profile/hunt-log');
  });

  it('Trophies and Life list are still reachable from Profile', async () => {
    await open('/profile');
    await fireEvent.press(await screen.findByTestId('menu-trophies'));
    expect(screen).toHavePathname('/profile/trophies');
    await fireEvent.press(await screen.findByLabelText('Back'));
    await fireEvent.press(await screen.findByTestId('menu-life-list'));
    expect(screen).toHavePathname('/profile/life-list');
  });

  it('Settings (gear) still opens Settings', async () => {
    await open('/profile');
    await fireEvent.press(await screen.findByLabelText('Settings'));
    expect(screen).toHavePathname('/profile/settings');
  });
});
