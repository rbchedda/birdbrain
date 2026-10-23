/**
 * State park outlines bundled read-only in the app (no database). Today: French Creek
 * State Park only, from PASDA's DCNR "DCNR State Parks 202503" layer, simplified by
 * scripts/fetch-french-creek.mjs. Wording below is final (approved Oct 22 2026): keep it verbatim.
 *
 * Never label a state park as open, public hunting, or open access as a whole:
 * DCNR allows hunting only in designated areas of the park.
 */
import frenchCreek from './frenchCreek.json';
import type { GeoJSONGeometry } from './types';

export interface StatePark {
  id: string;
  name: string;
  county: string;
  /** Official park hunting map (DCNR "Park Map with Hunting Boundaries"). */
  huntingMapUrl: string;
  geometry: GeoJSONGeometry;
}

/** Linked on the French Creek hunting page (pa.gov/agencies/dcnr/.../french-creek-state-park/hunting) as "Park Map with Hunting Boundaries". */
export const FRENCH_CREEK_HUNTING_MAP_URL = 'https://elibrary.dcnr.pa.gov/GetDocument?docId=1737668&DocName=FRCR_ParkMap.pdf';

export const STATE_PARK_LINE_1 =
  "State park (DCNR). Hunting allowed only in designated areas; check DCNR's park hunting map before you hunt.";
export const STATE_PARK_LINE_2 = 'Park boundary is approximate, not a survey. Park rules and closures apply.';

/**
 * {layer date} for the DCNR line. The PASDA layer JSON has no editingInfo/lastEditDate; the
 * layer is published as "DCNR State Parks 202503", so the date is March 2025.
 */
export const DCNR_LAYER_DATE = 'March 2025';

export const DCNR_SOURCES_TEXT = (layerDate: string) =>
  `Source: Pennsylvania Department of Conservation and Natural Resources (DCNR), Bureau of State Parks, state park boundaries, via PASDA (Pennsylvania Spatial Data Access). The publisher describes these as approximate boundaries, not a survey. Shown as published; last updated: ${layerDate}. Provided 'as is' without warranty. Not affiliated with or endorsed by DCNR or PASDA. Official information: dcnr.pa.gov.`;

const fc = frenchCreek.features[0];

export const STATE_PARKS: StatePark[] = [
  {
    id: 'park:french-creek',
    name: fc.properties.name,
    county: fc.properties.county,
    huntingMapUrl: FRENCH_CREEK_HUNTING_MAP_URL,
    geometry: fc.geometry as GeoJSONGeometry,
  },
];

/** GeoJSON for the map's own state-park layer. Properties carry no open/access status on purpose. */
export const stateParksGeoJSON = () => ({
  type: 'FeatureCollection' as const,
  features: STATE_PARKS.map((p) => ({ type: 'Feature' as const, properties: { id: p.id, name: p.name }, geometry: p.geometry })),
});
