import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';

type Result = { data: unknown; error: { message: string } | null };

/** Minimal chainable stand-in for supabase-js: from(table).select().eq().order()/maybeSingle(). */
function fakeClient(results: Record<string, Result>) {
  const query = (table: string) => {
    const done = Promise.resolve(results[table]);
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => done,
      maybeSingle: () => done,
    };
    return chain;
  };
  return { from: query, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
}

const place = { geom: { type: 'Point', coordinates: [-77.5, 40.5] }, county: 'Centre', type: 'stocking' };

describe('supabase placeDetail', () => {
  afterEach(() => jest.restoreAllMocks());

  it('warns with context when the stocking read fails, and keeps the outline', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const b = createSupabaseBackend(
      fakeClient({ places: { data: place, error: null }, stocking_events: { data: null, error: { message: 'boom' } } }),
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
    const b = createSupabaseBackend(fakeClient({ places: { data: place, error: null }, stocking_events: { data: rows, error: null } }));
    const d = await b.placeDetail('p1');
    expect(d.stocking).toEqual([
      { id: 'e1', placeId: 'p1', windowStart: '2026-10-08', windowEnd: '2026-10-09', counts: { roosters: 160, hens: 60 } },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
});
