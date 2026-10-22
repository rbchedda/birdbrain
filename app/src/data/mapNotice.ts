/**
 * Map and data disclaimers. Wording is from @lawyer (final, Oct 22 2026) and
 * /workspace/birdbrain-trespass-liability.md §4B: keep it verbatim. Change it
 * only with legal review.
 */
import hours from './huntingHours.json';
import type { DataSource, PlaceType } from './types';

/** §1: map banner. Always visible, not dismissible; tap opens the full notice. */
export const MAP_BANNER =
  'Boundaries are approximate, not a survey. Shows public land and PGC access-program land only. Get permission before entering any other private land.';

/**
 * One-line map banner approved by @lawyer (Oct 22 2026), verbatim including "(i)".
 * Always visible on the map, never dismissible, never hidden after first view.
 * Tapping it shows MAP_BANNER (the full notice) verbatim.
 */
export const MAP_BANNER_SHORT = 'Approximate boundaries, not a survey. Get permission for private land. (i)';

/** §3: shown above the general sheet text on enrolled private land. */
export const ENROLLED_PRIVATE_LINE =
  "Private land enrolled in a PGC public-access program. The owner allows hunting only under the program's terms. Follow all posted rules, closed areas, and safety zones, and respect any restrictions on vehicles, seasons, or species. Enrollment can change or end; verify at pa.gov/pgc.";

/** Memo §4B general place-sheet text; {date} is the layer's last PGC update. */
export const SHEET_HEADING = 'Check before you hunt.';
export const sheetText = (date: string) =>
  `Boundaries and locations come from PA Game Commission data, last updated ${date}, and may be outdated or off by many yards. They are not a legal survey. Obey all posted signs, purple paint, fences and safety zones (150 yd from occupied buildings). A pin here does not mean the land is open or that you have permission. Seasons and rules change: verify at pa.gov/pgc.`;
export const STOCKING_LINE = 'Release info is historical; never approach a release vehicle.';
export const DOVE_LINE = 'Field conditions and crops change.';

/** Product note on stocking pins (engineering review, Oct 22). */
export const STOCKING_PIN_NOTE = 'One PGC pin per property, not a release spot';

/** "Open today" is season status only. */
export const SEASON_ONLY_NOTE = 'Season status only. It doesn’t mean this land is open to you or that you have permission.';

/** §2: Data sources page. {per-layer date} is filled per layer below the text. */
export const DATA_SOURCES_TEXT = (perLayerDate: string) =>
  `Source: Pennsylvania Game Commission (State Game Lands boundaries, Hunter Access properties, pheasant stocking, managed dove fields, hunting zones), via PGC ArcGIS services. Shapes are shown as published by PGC; BirdBrain may rename fields and adjust display styling. Last updated: ${perLayerDate}. Provided 'as is' without warranty. Not authoritative data. Not affiliated with or endorsed by the PGC. Official information: pa.gov/pgc.`;

/** Public PGC layers shown on the Data sources page, keyed by ingest_state.source. */
export const LAYER_LABELS: Record<string, string> = {
  'pgc:state_game_lands': 'State Game Lands boundaries',
  'pgc:pheasant_stocking': 'Pheasant stocking (incl. Hunter Access properties)',
  'pgc:managed_dove_fields': 'Managed dove fields',
  'pgc:pa_counties': 'County boundaries',
  'pgc:hunting_hours': 'Hunting hours and zones',
};

/** ingest source for each place type, to find the {date} for a sheet. */
export const SOURCE_FOR_TYPE: Record<PlaceType, string> = {
  game_land: 'pgc:state_game_lands',
  stocking: 'pgc:pheasant_stocking',
  dove_field: 'pgc:managed_dove_fields',
};

/** Hunting hours and zones ship bundled; their date comes from that file's own ingest metadata. */
export const HOURS_LAYER: DataSource = {
  source: 'pgc:hunting_hours',
  lastEditDate: (hours as { lastEditDate?: string }).lastEditDate ?? null,
  lastRunAt: (hours as { fetchedAt?: string }).fetchedAt ?? null,
};

/** Public layers only, in display order, with the bundled hours layer last. */
export function publicLayers(rows: DataSource[]): DataSource[] {
  return [...rows.filter((r) => r.source in LAYER_LABELS && r.source !== HOURS_LAYER.source), HOURS_LAYER];
}

export function formatLayerDate(iso: string | null | undefined): string {
  if (!iso) return 'date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date unknown';
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
}

/** {date} for a place sheet: the place's layer date from ingest_state. */
export function layerDateFor(type: PlaceType, rows: DataSource[]): string {
  return formatLayerDate(rows.find((r) => r.source === SOURCE_FOR_TYPE[type])?.lastEditDate);
}
