import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { addJournalEntry, journalEntries, journalIdle, pendingDeletes, resetJournalForRestart, syncJournal } from '@/data/journal';
import { homeCountyLabel } from '@/app/(tabs)/profile';
import { backend } from '@/data';
import { saveDog } from '@/data/dogs';
import { HUNT_LOG_KEY } from '@/data/sampleBackend';
import { emptyDiaryDetails, type PostDraft } from '@/data/types';
import { todayET } from '@/lib/time';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

const me = { id: 'me', username: null, displayName: 'You' };
const draft = (caption: string, place = 'SGL 211'): PostDraft => ({
  species: 'pheasant',
  caption,
  huntedOn: todayET(),
  counts: [{ placeId: null, placeName: place, flushed: 0, roosters: 0, harvested: 0 }],
  exact: null,
  location: 'hidden',
  audience: 'private',
  groupSlug: null,
});

async function seed() {
  const ruby = await saveDog({ name: 'Ruby' });
  await addJournalEntry(draft('Opening day'), me, {
    ...emptyDiaryDetails(),
    species: ['pheasant'],
    flushes: 11,
    shots: 4,
    miles: 50,
    dogs: [{ dogId: ruby.id, name: 'Ruby', points: 26, flushes: 5, retrieves: 2 }],
    cover: ['cut_corn'],
    birds: [{ species: 'pheasant', count: 3, roosters: 3, hens: 0 }],
  });
  await syncJournal(backend);
}

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
});

describe('Profile hub', () => {
  it('leads with three stats, the hunt diary, then Trophies, Life list and Dogs', async () => {
    await seed();
    await open('/profile');
    expect(await screen.findByLabelText('1 days afield')).toBeTruthy();
    expect(screen.getByLabelText('11 flushes')).toBeTruthy();
    expect(screen.getByLabelText('1 game lands')).toBeTruthy();
    expect(screen.queryByLabelText(/life list$/)).toBeNull();
    expect(screen.getByText('Hunt diary')).toBeTruthy();
    expect(screen.getByText('See all 1 ›')).toBeTruthy();
    expect(screen.getByText(/SGL 211/)).toBeTruthy();
    expect(screen.getAllByText('🔒 Private').length).toBe(1);
    for (const t of ['🏅 TROPHIES & BADGES', '❦ LIFE LIST', '🐕 DOGS']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText('Ruby ›')).toBeTruthy();
    // Deferred to Settings (⚙).
    for (const gone of ['SEASON STATS', 'SETTINGS', 'Delete account', 'Privacy Policy', 'Log a hunt']) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.queryByText(/only on this device/)).toBeNull();
  });

  it('⚙ opens Settings with season stats, account, delete and legal (delete two taps away)', async () => {
    await seed();
    await open('/profile');
    await fireEvent.press(await screen.findByLabelText('Settings'));
    expect(await screen.findByText('SEASON STATS')).toBeTruthy();
    expect(screen.getAllByText('Delete account').length).toBeGreaterThan(0);
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('Community rules')).toBeTruthy();
  });

  it('stats card opens season stats', async () => {
    await seed();
    await open('/profile');
    await fireEvent.press(await screen.findByLabelText('1 days afield'));
    expect(await screen.findByTestId('season-stats')).toBeTruthy();
  });

  it('See all opens the full diary', async () => {
    await seed();
    await open('/profile');
    await fireEvent.press(await screen.findByText('See all 1 ›'));
    expect(await screen.findByTestId('hunt-log-list')).toBeTruthy();
  });

  it('shows the hunt log with sync status, season stats and tiles', async () => {
    await seed();
    await open('/profile/hunt-log');
    expect(await screen.findByText(/SGL 211/)).toBeTruthy();
    expect(screen.getByText(/Pheasant · Ruby · Cut corn · 11 flushes \/ 4 shots/)).toBeTruthy();
    expect(screen.getByLabelText('Sync status: Backed up')).toBeTruthy();
    expect(screen.getByTestId('season-stats')).toBeTruthy();
    expect(screen.getByLabelText('26 dog points')).toBeTruthy();
  });

  it('shows badges and a recap with no kill counts', async () => {
    await seed();
    await open('/profile/trophies');
    expect(await screen.findByText('BOOT LEATHER')).toBeTruthy();
    expect(screen.getByLabelText(/Boot Leather: earned/)).toBeTruthy();
    expect(screen.getByLabelText(/Good Dog: earned/)).toBeTruthy();
    expect(screen.getByLabelText(/Mentor: coming soon/)).toBeTruthy();
    expect(screen.getAllByText('1 DAY.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ONE GOOD DOG.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bird totals hidden').length).toBeGreaterThan(0);
    // Three birds were bagged; that number never appears as a trophy or recap stat.
    expect(screen.queryByText(/\b3 birds|birds in hand: |harvest/i)).toBeNull();
  });

  it('manages dogs and the life list', async () => {
    await seed();
    await open('/profile/dogs');
    expect(await screen.findByText(/1 hunts · 26 pts · 5 flushes · 2 retrieves/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Dog name'), 'Duke');
    await fireEvent.press(screen.getByText('Add dog'));
    expect(await screen.findByTestId('dog-card-Duke')).toBeTruthy();

    await open('/profile/life-list');
    expect(await screen.findByText('Pheasant')).toBeTruthy();
    expect(screen.getAllByText(/· new/).length).toBe(2);
  });
});

describe('Deleting a diary entry', () => {
  it('hides it, then deletes it from the account backup through the queue', async () => {
    await seed();
    const [e] = await journalEntries();
    expect(JSON.parse((await AsyncStorage.getItem(HUNT_LOG_KEY))!)[e.clientId]).toBeTruthy();

    await open(`/diary/${e.id}`);
    await fireEvent.press(await screen.findByText('Delete entry'));
    await fireEvent.press(screen.getByText('Yes, delete entry'));
    expect(await journalEntries()).toEqual([]);
    for (let i = 0; i < 50 && (await pendingDeletes()).length; i++) await new Promise((r) => setTimeout(r, 10));
    await journalIdle();
    expect(await pendingDeletes()).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem(HUNT_LOG_KEY))!)[e.clientId]).toBeUndefined();
  });
});

describe('Profile home county', () => {
  it('shows only an explicitly set county, never a zone', () => {
    expect(homeCountyLabel({ homeCounty: 'Lancaster' })).toBe('Lancaster County');
    expect(homeCountyLabel({ homeCounty: 'Centre County' })).toBe('Centre County');
    for (const unset of [null, undefined, {}, { homeCounty: null }, { homeCounty: '  ' }]) expect(homeCountyLabel(unset as never)).toBeNull();
  });

  it('renders the county when the profile has it and hides the row otherwise', async () => {
    await seed();
    const spy = jest.spyOn(backend, 'profile');
    const base = { username: 'tester', displayName: 'Test Hunter', hasDog: false };
    spy.mockImplementation(async (id: string) => ({ id, ...base, homeCounty: 'Lancaster' }));
    await open('/profile');
    expect(await screen.findByTestId('home-county')).toBeTruthy();
    expect(screen.getByText('Lancaster County')).toBeTruthy();
    expect(screen.queryByText(/Zone \d/)).toBeNull();
    spy.mockImplementation(async (id: string) => ({ id, ...base, homeCounty: null }));
    await open('/profile');
    await screen.findByText('Hunt diary');
    expect(screen.queryByTestId('home-county')).toBeNull();
    expect(screen.queryByText(/Zone \d|County$/)).toBeNull();
    spy.mockRestore();
  });

  it('never infers county from places, entries or location', async () => {
    await seed();
    await open('/profile');
    await screen.findByText('Hunt diary');
    expect(screen.queryByTestId('home-county')).toBeNull();
  });
});
