import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Minimal chainable stand-in for supabase-js: from(table).select().eq().order()/maybeSingle()/range().
 * `results[table]` answers every terminal call on that table; eq() calls are recorded.
 */
function fakeClient(results: Record<string, Result>, eqs: [string, string, unknown][] = []) {
  const query = (table: string) => {
    const done = () => Promise.resolve(results[table] ?? { data: [], error: null });
    const chain = {
      select: () => chain,
      eq: (col: string, v: unknown) => (eqs.push([table, col, v]), chain),
      order: () => Object.assign(done(), { range: done }),
      range: done,
      maybeSingle: done,
    };
    return chain;
  };
  return { from: query, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
}

const place = { geom: { type: 'Point', coordinates: [-77.5, 40.5] }, county: 'Centre', type: 'stocking' };
const spatial = { data: { county: 'Centre', basis: 'spatial' }, error: null };

describe('supabase placeDetail', () => {
  afterEach(() => jest.restoreAllMocks());

  it('warns with context when the stocking read fails, and keeps the outline', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const b = createSupabaseBackend(
      fakeClient({
        places: { data: place, error: null },
        place_stocking_county: spatial,
        stocking_events: { data: null, error: { message: 'boom' } },
      }),
    );
    const d = await b.placeDetail('p1');
    expect(d.stocking).toEqual([]);
    expect(d.outline).not.toBeNull();
    expect(warn).toHaveBeenCalledWith('placeDetail: stocking_events read failed for place p1 (county Centre): boom');
  });

  it('maps county release weeks and does not warn on success', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      { id: 'e1', county: 'Centre', release: 'youth', window_start: '2026-10-08', window_end: '2026-10-09', cocks: 160, hens: 60 },
      { id: 'e2', county: 'Centre', release: 'winter_3', window_start: '2027-01-05', window_end: '2027-01-07', cocks: 0, hens: 0 },
    ];
    const b = createSupabaseBackend(
      fakeClient({ places: { data: place, error: null }, place_stocking_county: spatial, stocking_events: { data: rows, error: null } }),
    );
    const d = await b.placeDetail('p1');
    expect(d.stocking).toEqual([
      { id: 'e1', placeId: 'p1', windowStart: '2026-10-08', windowEnd: '2026-10-09', counts: { roosters: 160, hens: 60 } },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('straddling SGL: matches release weeks on the allocation county from place_stocking_county', async () => {
    const eqs: [string, string, unknown][] = [];
    const b = createSupabaseBackend(
      fakeClient(
        {
          places: { data: place, error: null },
          place_stocking_county: { data: { county: 'Clinton', basis: 'allocation' }, error: null },
          stocking_events: { data: [], error: null },
        },
        eqs,
      ),
    );
    await b.placeDetail('p1');
    expect(eqs).toContainEqual(['place_stocking_county', 'place_id', 'p1']);
    expect(eqs).toContainEqual(['stocking_events', 'county', 'Clinton']);
    expect(eqs).not.toContainEqual(['stocking_events', 'county', 'Centre']);
  });

  it('falls back to the spatial county (with a warning) if the view read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const eqs: [string, string, unknown][] = [];
    const b = createSupabaseBackend(
      fakeClient(
        {
          places: { data: place, error: null },
          place_stocking_county: { data: null, error: { message: 'no view' } },
          stocking_events: { data: [], error: null },
        },
        eqs,
      ),
    );
    const d = await b.placeDetail('p1');
    expect(d.outline).not.toBeNull();
    expect(eqs).toContainEqual(['stocking_events', 'county', 'Centre']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('place_stocking_county read failed for place p1'));
  });
});

describe('supabase listPlaces', () => {
  afterEach(() => jest.restoreAllMocks());
  const placeRows = [
    { id: 'sgl', type: 'stocking', name: 'State Game Lands 1', county: 'Centre', species: ['pheasant'], centroid: { type: 'Point', coordinates: [-77.5, 40.5] }, acres: 10, property_type: 'SGL', sgl: '1' },
    { id: 'gl', type: 'game_land', name: 'State Game Lands 2', county: 'York', species: [], centroid: { type: 'Point', coordinates: [-76.7, 39.9] }, acres: 5 },
  ];

  it('sets stockingCounty from place_stocking_county (straddling SGL keeps its spatial county too)', async () => {
    const b = createSupabaseBackend(
      fakeClient({
        places: { data: placeRows, error: null },
        place_stocking_county: { data: [{ place_id: 'sgl', county: 'Clinton' }], error: null },
      }),
    );
    const places = await b.listPlaces();
    const sgl = places.find((p) => p.id === 'sgl');
    expect(sgl).toMatchObject({ county: 'Centre', stockingCounty: 'Clinton' });
    expect(places.find((p) => p.id === 'gl')?.stockingCounty).toBeUndefined();
  });

  it('keeps places (spatial counties) if the view read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const b = createSupabaseBackend(
      fakeClient({ places: { data: placeRows, error: null }, place_stocking_county: { data: null, error: { message: 'x' } } }),
    );
    const places = await b.listPlaces();
    expect(places).toHaveLength(2);
    expect(places[0].stockingCounty).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
