import type { Place } from './types';

/**
 * Placeholder places for the map prototype. Names, counties and windows are
 * illustrative only; real data comes from PASDA / PGC via the ingestion job.
 */
export const samplePlaces: Place[] = [
  {
    id: 'sgl-sample-1',
    name: 'State Game Lands (sample A)',
    type: 'game_land',
    county: 'Centre',
    species: ['grouse', 'turkey'],
    pin: { x: 0.32, y: 0.3 },
    note: 'Mixed hardwood ridges. Parking lots on the north and east sides.',
  },
  {
    id: 'stock-sample-1',
    name: 'Pheasant stocking (sample B)',
    type: 'stocking',
    county: 'Lancaster',
    species: ['pheasant'],
    pin: { x: 0.62, y: 0.46 },
    note: 'Warm-season grass fields along the creek bottom.',
    stockingWindow: 'Sample window — check PGC allocation tables',
  },
  {
    id: 'dove-sample-1',
    name: 'Managed dove field (sample C)',
    type: 'dove_field',
    county: 'York',
    species: ['dove'],
    pin: { x: 0.48, y: 0.64 },
    note: 'Sunflower and wheat plots. Migratory bird license required.',
  },
  {
    id: 'sgl-sample-2',
    name: 'State Game Lands (sample D)',
    type: 'game_land',
    county: 'Crawford',
    species: ['waterfowl', 'turkey'],
    pin: { x: 0.18, y: 0.58 },
    note: 'Marsh impoundments and wooded edges.',
  },
];
