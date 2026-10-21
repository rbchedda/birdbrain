import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import bundled from '@/data/pgcStocking.json';
import {
  distanceKm,
  doveFields,
  plannerRows,
  samplePlaces,
  sampleStocking,
  stockingFor,
  stockingWindows,
  windowsForCounty,
} from '@/data/places';
import type { Place } from '@/data/types';

const seed = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'data', 'pgc', 'pheasant-allocation-2026-27.json'), 'utf8'));
const point = (id: string, county: string | null, lng: number, lat: number): Place => ({
  id, name: id, type: 'stocking', county, species: ['pheasant'], center: { lng, lat }, acres: null,
});

describe('stocking data comes only from the PGC ingest seed', () => {
  it('bundled copy matches data/pgc exactly (run app/scripts/sync-stocking.mjs if this fails)', () => {
    expect(bundled).toEqual(seed);
  });

  it('every window is a seed event; nothing invented', () => {
    const key = (e: { county: string; release: string; window_start: string; window_end: string; cocks: number; hens: number }) =>
      `${e.county}|${e.release}|${e.window_start}|${e.window_end}|${e.cocks}|${e.hens}`;
    const seedKeys = new Set(seed.events.map(key));
    for (const w of stockingWindows) {
      expect(seedKeys.has(key({ county: w.county, release: w.release, window_start: w.windowStart, window_end: w.windowEnd, cocks: w.cocks, hens: w.hens }))).toBe(true);
    }
    expect(stockingWindows).toHaveLength(seed.events.length);
  });

  it('sample stocking detail is derived from the seed for the sample counties', () => {
    for (const e of sampleStocking) {
      const place = samplePlaces.find((p) => p.id === e.placeId)!;
      expect(windowsForCounty(place.county).some((w) => w.windowStart === e.windowStart && w.cocks === e.counts.roosters)).toBe(true);
    }
  });

  it('skips releases with no birds and points without a county', () => {
    expect(windowsForCounty('Bucks').some((w) => w.release === 'winter_2')).toBe(false);
    expect(stockingFor(point('x', null, -77, 40))).toEqual([]);
    expect(plannerRows([point('x', null, -77, 40)], { today: '2026-11-01' })[0].next).toBeNull();
  });
});

describe('planner sorting', () => {
  // Real counties from the seed; positions are arbitrary test points.
  const york = point('york', 'York', -76.7, 39.96);
  const centre = point('centre', 'Centre', -77.86, 40.79);
  const erie = point('erie', 'Erie', -80.08, 42.12);
  const all = [erie, centre, york];

  it('sorts by current/next window, with the window found in the seed', () => {
    const rows = plannerRows(all, { today: '2026-11-01' });
    for (const r of rows) {
      expect(r.next!.windowEnd >= '2026-11-01').toBe(true);
      expect(windowsForCounty(r.place.county).find((w) => w.windowEnd >= '2026-11-01')).toEqual(r.next);
    }
    const starts = rows.map((r) => r.next!.windowStart);
    expect([...starts].sort()).toEqual(starts);
  });

  it('marks a county as stocking this week inside its window', () => {
    const [row] = plannerRows([york], { today: '2026-11-04' });
    expect(row).toMatchObject({ current: true, next: { release: 'in_season_2', windowStart: '2026-11-03', windowEnd: '2026-11-06' } });
  });

  it('sorts by distance from a chosen origin', () => {
    const rows = plannerRows(all, { today: '2026-11-01', origin: york.center, sort: 'distance' });
    expect(rows.map((r) => r.place.id)).toEqual(['york', 'centre', 'erie']);
    expect(rows[0].km).toBe(0);
    expect(Math.round(distanceKm(york.center, erie.center))).toBeGreaterThan(300);
  });

  it('filters to saved sites', () => {
    expect(plannerRows(all, { today: '2026-11-01', savedIds: ['centre'], savedOnly: true }).map((r) => r.place.id)).toEqual(['centre']);
  });

  it('lists dove fields by distance', () => {
    const d = (id: string, lng: number): Place => ({ ...point(id, 'York', lng, 40), type: 'dove_field', species: ['dove'] });
    expect(doveFields([d('far', -80), d('near', -76.8), york], york.center).map((x) => x.place.id)).toEqual(['near', 'far']);
  });
});

describe('no live user locations', () => {
  it('the planner and map screen never read device location', () => {
    for (const f of ['components/StockingList.tsx', 'app/(tabs)/index.tsx', 'data/places.ts']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8');
      expect(src).not.toMatch(/expo-location|navigator\.geolocation|getCurrentPosition|watchPosition/);
    }
  });
});
