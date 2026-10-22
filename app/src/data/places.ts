import allocation from './pgcStocking.json';

import type { LngLat, Place, StockingEvent } from './types';

/**
 * Offline sample places, used when Supabase isn't configured. Names and
 * windows are illustrative only; real data comes from the PGC ingestion job.
 */
export const samplePlaces: Place[] = [
  {
    id: 'sgl-sample-1',
    name: 'State Game Lands (sample A)',
    type: 'game_land',
    county: 'Centre',
    species: [],
    center: { lng: -77.93, lat: 40.86 },
    acres: 7200,
    access: 'state_game_land',
    note: 'Mixed hardwood ridges. Parking lots on the north and east sides.',
  },
  {
    id: 'stock-sample-1',
    name: 'Pheasant stocking (sample B)',
    type: 'stocking',
    county: 'Lancaster',
    species: ['pheasant'],
    center: { lng: -76.21, lat: 40.11 },
    acres: null,
    access: 'other_public',
    note: 'Warm-season grass fields along the creek bottom.',
  },
  {
    id: 'dove-sample-1',
    name: 'Managed dove field (sample C)',
    type: 'dove_field',
    county: 'York',
    species: ['dove'],
    center: { lng: -76.83, lat: 39.93 },
    acres: 35,
    access: 'state_game_land',
    note: 'Sunflower and wheat plots. Migratory bird license required.',
  },
  {
    id: 'sgl-sample-2',
    name: 'State Game Lands (sample D)',
    type: 'game_land',
    county: 'Crawford',
    species: [],
    center: { lng: -80.21, lat: 41.62 },
    acres: 5400,
    access: 'state_game_land',
    note: 'Marsh impoundments and wooded edges.',
  },
  {
    id: 'stock-sample-2',
    name: 'Pheasant stocking (sample E)',
    type: 'stocking',
    county: 'Bucks',
    species: ['pheasant'],
    center: { lng: -75.12, lat: 40.43 },
    acres: null,
    access: 'enrolled_private',
    note: 'Hedgerows and cut corn. Busy on Saturdays.',
  },
  {
    id: 'sgl-sample-3',
    name: 'State Game Lands (sample F)',
    type: 'game_land',
    county: 'Clinton',
    species: [],
    center: { lng: -77.62, lat: 41.29 },
    acres: 12100,
    access: 'state_game_land',
    note: 'Aspen cuts on the plateau, good grouse cover.',
  },
];

/**
 * PGC pheasant stocking windows, from the committed ingest seed
 * data/pgc/pheasant-allocation-2026-27.json (ingest/stocking_windows.mjs; copied
 * into the app by scripts/sync-stocking.mjs; the
 * same file loads public.stocking_events). PGC publishes a shipping week per
 * county and release, not a day or a property, so the app never shows more
 * precision than that.
 */
export const STOCKING_SOURCE = {
  url: allocation.source,
  citation: allocation.citation,
  season: allocation.season,
};

export interface StockingWindow {
  id: string;
  region: string;
  county: string;
  release: string;
  /** As published, e.g. "1ST IN- SEASON". */
  label: string;
  junior: boolean;
  /** As published, e.g. "Nov. 3-6". */
  shipWeek: string;
  windowStart: string;
  windowEnd: string;
  cocks: number;
  hens: number;
}

export const stockingWindows: StockingWindow[] = allocation.events.map((e) => ({
  id: `${e.county}:${e.release}`,
  region: e.region,
  county: e.county,
  release: e.release,
  label: e.label,
  junior: e.junior,
  shipWeek: e.ship_week,
  windowStart: e.window_start,
  windowEnd: e.window_end,
  cocks: e.cocks,
  hens: e.hens,
}));

/** Properties PGC lists as stocked, per county. */
export const stockedProperties: { county: string; name: string; sgl: number | null; winterLate: boolean }[] =
  allocation.properties.map((p) => ({ county: p.county, name: p.name, sgl: p.sgl, winterLate: p.winter_late }));

const norm = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

/** The county whose PGC release weeks apply to a stocking point: the allocation county if known, else the spatial one. */
export const stockingCountyOf = (place: Pick<Place, 'county' | 'stockingCounty'>) => place.stockingCounty ?? place.county;

/** A county's release weeks with birds allocated (PGC lists some releases with 0 for a county). */
export const windowsForCounty = (county: string | null | undefined) =>
  stockingWindows
    .filter((w) => norm(w.county) === norm(county) && w.cocks + w.hens > 0)
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart));

/** County windows for a stocking point, in the PlaceDetail shape. Empty if the county isn't in PGC's table. */
export function stockingFor(place: Place): StockingEvent[] {
  if (place.type !== 'stocking') return [];
  return windowsForCounty(stockingCountyOf(place)).map((w) => ({
    id: w.id,
    placeId: place.id,
    windowStart: w.windowStart,
    windowEnd: w.windowEnd,
    counts: { roosters: w.cocks, hens: w.hens },
  }));
}

/** Sample-mode detail data, derived from the real PGC windows for each sample place's county. */
export const sampleStocking: StockingEvent[] = samplePlaces.flatMap(stockingFor);

/** Great-circle distance in km. */
export function distanceKm(a: LngLat, b: LngLat) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface PlannerRow {
  place: Place;
  /** Current or next window for the place's county, or null if none remain this season. */
  next: StockingWindow | null;
  current: boolean;
  km: number | null;
  saved: boolean;
}

export type PlannerSort = 'window' | 'distance';

/**
 * Stocking points with their current/next county window, optionally filtered
 * to saved sites, sorted by window then distance, or distance then window.
 * Distance is from a place the user picked (never their live location).
 */
export function plannerRows(
  places: Place[],
  opts: { today: string; origin?: LngLat | null; savedIds?: string[]; savedOnly?: boolean; sort?: PlannerSort },
): PlannerRow[] {
  const saved = new Set(opts.savedIds ?? []);
  const rows = places
    .filter((p) => p.type === 'stocking' && (!opts.savedOnly || saved.has(p.id)))
    .map((place) => {
      const next = windowsForCounty(stockingCountyOf(place)).find((w) => w.windowEnd >= opts.today) ?? null;
      return {
        place,
        next,
        current: !!next && next.windowStart <= opts.today,
        km: opts.origin ? distanceKm(opts.origin, place.center) : null,
        saved: saved.has(place.id),
      };
    });
  const byWindow = (a: PlannerRow, b: PlannerRow) =>
    (a.next?.windowStart ?? '9999').localeCompare(b.next?.windowStart ?? '9999');
  const byKm = (a: PlannerRow, b: PlannerRow) => (a.km ?? Infinity) - (b.km ?? Infinity);
  const byName = (a: PlannerRow, b: PlannerRow) => a.place.name.localeCompare(b.place.name);
  return rows.sort((a, b) =>
    opts.sort === 'distance' ? byKm(a, b) || byWindow(a, b) || byName(a, b) : byWindow(a, b) || byKm(a, b) || byName(a, b),
  );
}

/** Dove fields sorted by distance from the picked origin (or by name). */
export const doveFields = (places: Place[], origin?: LngLat | null) =>
  places
    .filter((p) => p.type === 'dove_field')
    .map((place) => ({ place, km: origin ? distanceKm(origin, place.center) : null }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.place.name.localeCompare(b.place.name));

/** General crowding tips. Not tied to any date or place. */
export const crowdingTips = [
  'Release days and the first Saturday after are the busiest. Weekdays are quieter.',
  'Later in the day, after the early crowd has left, birds that held tight are still there.',
  'Walk past the first field from the lot; most pressure is within a few hundred yards of parking.',
  'Late-season winter releases (bold-underlined game lands on PGC’s list) see far fewer hunters.',
];
