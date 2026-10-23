import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { knownHours, openTag, sheetHeight } from '@/app/(tabs)/index';
import { MAP_BANNER, MAP_BANNER_SHORT } from '@/data/mapNotice';
import type { PlaceToday } from '@/data/seasons';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const start = new Date('2026-10-24T10:57:00Z');
const end = new Date('2026-10-24T22:30:00Z');
const open = (youth = false) => ({ kind: 'open', season: { youth }, start, end }) as never;
const closed = { kind: 'closed', nextOpen: null } as never;
const today = (statuses: PlaceToday['statuses']): PlaceToday => ({
  date: '2026-10-24' as never,
  open: statuses.some((s) => s.status.kind === 'open' && !(s.status as { season: { youth: boolean } }).season.youth),
  statuses,
});

describe('(d) open tag', () => {
  it('names the species when exactly one is in season', () => {
    expect(openTag(today([{ species: 'pheasant', status: open() }, { species: 'dove', status: closed }]))).toBe('Pheasant open');
  });
  it('says "Season open today" when more than one is in season, and ignores youth-only seasons', () => {
    expect(openTag(today([{ species: 'pheasant', status: open() }, { species: 'grouse', status: open() }]))).toBe('Season open today');
    expect(openTag(today([{ species: 'pheasant', status: open(true) }, { species: 'grouse', status: open() }]))).toBe('Grouse open');
    expect(openTag(today([{ species: 'pheasant', status: closed }]))).toBeNull();
  });
});

describe('legal hours', () => {
  it('lists per-species hours, but not waterfowl (goose-season exceptions) or youth-only seasons', () => {
    const rows = knownHours(
      today([
        { species: 'dove', status: open() },
        { species: 'waterfowl', status: open() },
        { species: 'pheasant', status: open(true) },
      ]),
    );
    expect(rows.map((r) => r.species)).toEqual(['dove']);
  });
});

describe('sheet never covers the banner block', () => {
  it('caps the expanded height to leave map below the banner', () => {
    // Spec (Oct 23): HALF = 50% of the space above the tab bar, never over the banner block.
    expect(sheetHeight(844, 200)).toBe(422);
    expect(sheetHeight(844, 520)).toBe(844 - 520 - 8);
    expect(sheetHeight(1200, 100)).toBe(600);
  });
});

describe('map screen', () => {
  const go = () => renderRouter('./src/app', { initialUrl: '/' });

  it('(e) collapsed sheet shows only the handle and "N spots nearby"; the list appears on pull-up and via search', async () => {
    await go();
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    expect(screen.getByLabelText('Expand details')).toBeTruthy();
    expect(screen.queryByLabelText('State Game Lands (sample A)')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Expand details'));
    expect(screen.getByLabelText('State Game Lands (sample A)')).toBeTruthy();
    // Handle tap cycles PEEK -> HALF -> FULL -> PEEK (spec, Oct 23).
    await fireEvent.press(screen.getByLabelText('Expand details'));
    await fireEvent.press(screen.getByLabelText('Collapse details'));
    expect(screen.queryByLabelText('State Game Lands (sample A)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search places'), 'sample C');
    await fireEvent(screen.getByLabelText('Search places'), 'submitEditing');
    const handle = screen.queryByLabelText('Expand details');
    if (handle) await fireEvent.press(handle);
    expect(await screen.findByLabelText('Managed dove field (sample C)')).toBeTruthy();
  });

  it('(a) the release card shows only when the sheet is expanded', async () => {
    await go();
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('Expand details'));
    await fireEvent.press(screen.getByLabelText('Pheasant stocking (sample B)'));
    await screen.findByLabelText('Back to list');
    expect(screen.getByTestId('release-card')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Expand details'));
    await fireEvent.press(screen.getByLabelText('Collapse details'));
    expect(screen.queryByTestId('release-card')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Expand details'));
    expect(screen.getByTestId('release-card')).toBeTruthy();
  });

  it('hours use the neutral "Legal hours today" label', async () => {
    await go();
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('Expand details'));
    await fireEvent.press(screen.getByLabelText('Managed dove field (sample C)'));
    expect(await screen.findByText('Legal hours today')).toBeTruthy();
    expect(screen.queryByText(/Small-game legal hours/)).toBeNull();
  });

  it('(1) banner expands inline with the exact full notice, a data-sources link and "Got it"; tap or Got it collapses', async () => {
    await go();
    await screen.findByText('6 spots nearby');
    const banner = screen.getByTestId('map-banner');
    await fireEvent.press(banner);
    expect(screen.getByTestId('map-full-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
    expect(screen.getByText('View data sources ›')).toBeTruthy();
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    await fireEvent.press(screen.getByText('Got it'));
    expect(screen.queryByTestId('map-full-notice')).toBeNull();
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    await fireEvent.press(screen.getByTestId('map-banner'));
    expect(screen.getByTestId('map-full-notice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('map-banner'));
    expect(screen.queryByTestId('map-full-notice')).toBeNull();
    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByText('View data sources ›'));
    expect(await screen.findByText('Map notice & data sources')).toBeTruthy();
  });

  it('(2) banner a11y label is the exact full notice and the hint is "Double-tap to expand."', async () => {
    await go();
    await screen.findByText('6 spots nearby');
    const banner = screen.getByTestId('map-banner');
    expect(banner.props.accessibilityLabel).toBe(MAP_BANNER);
    expect(banner.props.accessibilityHint).toBe('Double-tap to expand.');
    expect(screen.getByLabelText(MAP_BANNER)).toBe(banner);
  });
});
