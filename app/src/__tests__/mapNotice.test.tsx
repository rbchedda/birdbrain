import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { within } from '@testing-library/react-native';

import { backend } from '@/data';
import { loadPlaces } from '@/data/hooks';
import { ENROLLED_PRIVATE_LINE, MAP_BANNER, MAP_BANNER_SHORT, layerDateFor, publicLayers } from '@/data/mapNotice';

/** The collapsed sheet shows only "N spots nearby"; pull it up to reach the list. */
async function expandSheet() {
  const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
  if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
}
import { createSupabaseBackend } from '@/data/supabaseBackend';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
afterAll(() => AsyncStorage.clear());

/** Minimal chainable supabase-js stand-in: every query on `table` resolves to rows[table]. */
function fakeSb(rows: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'range', 'eq', 'in']) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) => res({ data: rows[table] ?? [], error: null });
      return b;
    },
  } as unknown as SupabaseClient;
}
const pt = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] });

describe('hosted places: unknown land status is hidden', () => {
  it('keeps SGL, other public and enrolled land, drops unknown or missing property_type', async () => {
    const sb = fakeSb({
      places: [
        { id: 'g', type: 'game_land', name: 'State Game Lands 1', centroid: pt(-77, 41), acres: 10, source: 'pgc:state_game_lands' },
        { id: 's1', type: 'stocking', name: 'State Game Lands 109', centroid: pt(-80, 42), property_type: 'SGL', sgl: '109' },
        { id: 's2', type: 'stocking', name: 'Codorus State Park', centroid: pt(-76.9, 39.8), property_type: 'Other Properties' },
        { id: 's3', type: 'stocking', name: 'Carlson Hunter Access Property', centroid: pt(-78.3, 41.9), property_type: 'Other Properties' },
        { id: 's4', type: 'stocking', name: 'Jeffers Tree Farm', centroid: pt(-75.7, 41.8), property_type: null },
        { id: 's5', type: 'stocking', name: 'Hanson Aggregates', centroid: pt(-79.3, 40.3), property_type: 'Other Properties' },
        { id: 'd1', type: 'dove_field', name: 'Dove field 419', centroid: pt(-76, 40), sgl: null, description: 'Millet' },
        // A stored label wins over re-derivation.
        { id: 's6', type: 'stocking', name: 'Odd name', centroid: pt(-77, 40), property_type: 'Other Properties', access_type: 'other_public' },
      ],
    });
    const places = await createSupabaseBackend(sb).listPlaces();
    expect(Object.fromEntries(places.map((p) => [p.id, p.access]))).toEqual({
      g: 'state_game_land', s1: 'state_game_land', s2: 'other_public', s3: 'enrolled_private', s6: 'other_public',
    });
  });

  it('reads per-layer dates from ingest_state and shows public layers only', async () => {
    const sb = fakeSb({
      ingest_state: [
        { source: 'pgc:state_game_lands', last_edit_date: '2026-10-19T19:03:13Z', last_run_at: '2026-10-22T01:34:48Z' },
        { source: 'internal:something', last_edit_date: null, last_run_at: null },
      ],
    });
    const rows = await createSupabaseBackend(sb).dataSources();
    expect(layerDateFor('game_land', rows)).toBe('Oct 19, 2026');
    expect(layerDateFor('stocking', rows)).toBe('date unknown');
    expect(publicLayers(rows).map((r) => r.source)).toEqual(['pgc:state_game_lands', 'pgc:hunting_hours']);
  });
});

describe('map and sheet notices', () => {
  const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

  it('sheet: season-only note, layer date, stocking pin note, enrolled line, report link', async () => {
    const spy = jest.spyOn(backend, 'dataSources').mockResolvedValue([
      { source: 'pgc:pheasant_stocking', lastEditDate: '2026-10-20T19:02:48Z', lastRunAt: '2026-10-22T01:34:50Z' },
    ]);
    try {
      await loadPlaces(true);
      await open('/');
      await screen.findByText('6 spots nearby');
      await expandSheet();
    await fireEvent.press(screen.getByLabelText('Pheasant stocking (sample E)'));
      expect(await screen.findByText(ENROLLED_PRIVATE_LINE)).toBeTruthy();
      expect(screen.getByTestId('place-access').props.children.join('')).toMatch(
        /PGC access-program land \(private\) · One PGC pin per property, not a release spot/,
      );
      expect(screen.getByTestId('season-only-note')).toBeTruthy();
      expect(await screen.findByText(/last updated Oct 20, 2026/)).toBeTruthy();
      expect(screen.getByText(/never approach a release vehicle/)).toBeTruthy();
      expect(screen.getByText('Report a map error')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('public land sheets do not get the enrolled line', async () => {
    await open('/');
    await screen.findByText('6 spots nearby');
    await expandSheet();
    await fireEvent.press(screen.getByLabelText('Managed dove field (sample C)'));
    expect(await screen.findByText(/Field conditions and crops change/)).toBeTruthy();
    expect(screen.queryByTestId('enrolled-line')).toBeNull();
  });

  it('shows the approved one-line banner verbatim, and tapping it shows the full notice verbatim', async () => {
    expect(MAP_BANNER_SHORT).toBe('Approximate boundaries, not a survey. Get permission for private land. (i)');
    expect(MAP_BANNER).toBe(
      'Boundaries are approximate, not a survey. Shows public land and PGC access-program land only. Get permission before entering any other private land.',
    );
    await open('/');
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    expect(screen.queryByTestId('map-full-notice')).toBeNull();
    await fireEvent.press(screen.getByTestId('map-banner'));
    expect(screen.getByTestId('map-full-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
    // The full notice still leads to Data sources.
    await fireEvent.press(screen.getByText('View data sources ›'));
    expect(await screen.findByText('Map notice & data sources')).toBeTruthy();
  });

  it('banner has no dismiss path: no close control, and it is still shown after collapsing, a remount and a second view', async () => {
    await open('/');
    await screen.findByText('6 spots nearby');
    const banner = screen.getByTestId('map-banner');
    expect(banner).toHaveTextContent(MAP_BANNER_SHORT);
    // No dismiss/close control anywhere in or next to the banner.
    expect(screen.queryByLabelText(/dismiss|close (notice|banner)|hide banner/i)).toBeNull();
    expect(within(banner).queryByRole('button')).toBeNull();

    // Opening and closing the full notice never removes the one-liner.
    await fireEvent.press(banner);
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    await fireEvent.press(screen.getByTestId('map-banner'));
    expect(screen.queryByTestId('map-full-notice')).toBeNull();
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);

    // Selecting a place, opening layers and searching keep it visible.
    await fireEvent.press(screen.getByLabelText('Map layers'));
    await expandSheet();
    await fireEvent.press(screen.getByLabelText('State Game Lands (sample A)'));
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);

    // Leave the map and come back (second view), then a fresh remount: still shown, nothing persisted to hide it.
    await fireEvent.press(screen.getByRole('tab', { name: 'Guide' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Map' }));
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => /banner|notice/i.test(k))).toEqual([]);

    await open('/');
    await screen.findByText('6 spots nearby');
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
  });

  it('place sheet keeps the full banner, heading and sheet text verbatim (no truncation)', async () => {
    await open('/');
    await expandSheet();
    await fireEvent.press(await screen.findByLabelText('State Game Lands (sample A)'));
    expect(await screen.findByTestId('place-map-banner')).toHaveTextContent(MAP_BANNER);
    const notice = screen.getByTestId('place-notice');
    expect(notice).toHaveTextContent(/Check before you hunt\. Boundaries and locations come from PA Game Commission data, last updated .+, and may be outdated or off by many yards\. They are not a legal survey\. Obey all posted signs, purple paint, fences and safety zones \(150 yd from occupied buildings\)\. A pin here does not mean the land is open or that you have permission\. Seasons and rules change: verify at pa\.gov\/pgc\./);
    expect(screen.queryByText(/Read ›/)).toBeNull();
  });
});
