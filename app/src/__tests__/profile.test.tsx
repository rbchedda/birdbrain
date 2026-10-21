import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { addJournalEntry, journalEntries, journalIdle, pendingDeletes, resetJournalForRestart, syncJournal } from '@/data/journal';
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
  it('leads with days afield and links every section', async () => {
    await seed();
    await open('/profile');
    expect(await screen.findByLabelText('1 days afield')).toBeTruthy();
    expect(screen.getByLabelText('11 flushes')).toBeTruthy();
    expect(screen.getByLabelText('1 game lands')).toBeTruthy();
    for (const t of ['TROPHIES & BADGES', 'HUNT LOG (DIARY)', 'SEASON STATS', 'LIFE LIST', 'DOGS', 'SETTINGS']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText(/1 private entry · season view/)).toBeTruthy();
    expect(screen.getByText('Ruby ›')).toBeTruthy();
    // dev-1's account flow and legal links stay.
    expect(screen.getByText('Delete account')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('Community rules')).toBeTruthy();
    expect(screen.queryByText(/only on this device/)).toBeNull();
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
