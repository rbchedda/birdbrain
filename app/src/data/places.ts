import type { Place, StockingEvent } from './types';

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
    note: 'Aspen cuts on the plateau, good grouse cover.',
  },
];

export const sampleStocking: StockingEvent[] = [
  {
    id: 'se-1',
    placeId: 'stock-sample-1',
    windowStart: '2026-10-19',
    windowEnd: '2026-10-23',
    counts: { roosters: 400 },
  },
  {
    id: 'se-2',
    placeId: 'stock-sample-1',
    windowStart: '2026-11-02',
    windowEnd: '2026-11-06',
    counts: { roosters: 250, hens: 50 },
  },
  {
    id: 'se-3',
    placeId: 'stock-sample-2',
    windowStart: '2026-10-26',
    windowEnd: '2026-10-30',
    counts: { roosters: 300 },
  },
];
