import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { addJournalEntry, journalIdle, resetJournalForRestart } from '@/data/journal';
import { emptyDiaryDetails } from '@/data/types';
import { todayET } from '@/lib/time';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });
const me = { id: 'me', username: null, displayName: 'You' };

beforeEach(async () => {
  await journalIdle();
  await AsyncStorage.clear();
  resetJournalForRestart();
});

describe('Stats screens', () => {
  it('sample preview: six cards, the Only-you pill, a sample badge, 118 flushes, no coordinates', async () => {
    await open('/profile/stats?sample=1');
    expect(await screen.findByTestId('stats-sample-badge')).toBeTruthy();
    for (const id of ['days', 'calendar', 'species', 'flush', 'places', 'dogs']) expect(screen.getByTestId(`stats-card-${id}`)).toBeTruthy();
    expect(screen.getByLabelText('118 flushes')).toBeTruthy();
    expect(screen.getByLabelText('30 days afield')).toBeTruthy();
    expect(screen.getByText(/Only you/)).toBeTruthy();
    expect(screen.queryByText(/\blat\b|\blng\b|latitude|longitude/i)).toBeNull();
    expect(screen.queryByText(/birds in hand/i)).toBeNull();
  });

  it('dog work detail: per-hunt averages are rounded to one decimal', async () => {
    await open('/profile/stats/dogs?sample=1');
    expect(await screen.findByText(/Per hunt: 1\.4 points, 1\.8 flushes, 0\.4 retrieves\./)).toBeTruthy();
    expect(screen.queryByText(/\d\.\d{3,}/)).toBeNull();
  });

  it('one hunt: locked teasers with progress, and "–" for tiles never logged', async () => {
    await addJournalEntry(
      { species: 'pheasant', caption: '', huntedOn: todayET(), counts: [{ placeId: null, placeName: 'Back 40', flushed: 0, roosters: 0, harvested: 0 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
      me,
      { ...emptyDiaryDetails(), species: ['pheasant'] },
    );
    await open('/profile/stats');
    expect(await screen.findByTestId('stats-tiles')).toBeTruthy();
    expect(screen.getByLabelText('1 days afield')).toBeTruthy();
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('stats-empty')).toBeNull();
    expect(screen.queryByTestId('stats-bests')).toBeNull();
  });

  it('season filter sheet lists This season first and All time last', async () => {
    await addJournalEntry(
      { species: 'pheasant', caption: '', huntedOn: todayET(), counts: [], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
      me,
    );
    await open('/profile/stats');
    await fireEvent.press(await screen.findByTestId('stats-season-pill'));
    expect(await screen.findByTestId('season-sheet')).toBeTruthy();
    expect(screen.getByText('PA seasons run Jul 1 to Jun 30.')).toBeTruthy();
    expect(screen.getByText(/· this season/)).toBeTruthy();
    expect(screen.getByText(/by season, no calendar/)).toBeTruthy();
    const keys = screen.getAllByTestId(/^season-option-/).map((n) => n.props.testID);
    expect(keys[0]).toMatch(/^season-option-\d{4}-\d{2}$/);
    expect(keys[keys.length - 1]).toBe('season-option-all');
  });

  it('share card is not available while the flag is off, and shows no share button', async () => {
    await open('/profile/stats/share?sample=1');
    expect(await screen.findByText(/Sharing your season is not available yet/)).toBeTruthy();
    expect(screen.queryByTestId('share-card')).toBeNull();
    expect(screen.queryByText('Share')).toBeNull();
  });

  it('hunt log opened from a chart is filtered, with a Clear chip', async () => {
    const mk = (species: 'pheasant' | 'dove', place: string) =>
      addJournalEntry(
        { species, caption: '', huntedOn: todayET(), counts: [{ placeId: null, placeName: place, flushed: 1, roosters: 0, harvested: 0 }], exact: null, location: 'hidden', audience: 'private', groupSlug: null },
        me,
        { ...emptyDiaryDetails(), species: [species] },
      );
    await mk('pheasant', 'Back 40');
    await mk('dove', 'Cornfield');
    await open('/profile/hunt-log?species=dove&label=Dove');
    expect(await screen.findByText(/Dove · 1 hunt/)).toBeTruthy();
    fireEvent.press(screen.getByText(/Dove · 1 hunt/));
    expect(await screen.findByText(/Back 40/)).toBeTruthy();
    expect(screen.queryByText(/Dove · 1 hunt/)).toBeNull();
  });
});
