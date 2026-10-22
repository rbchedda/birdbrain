import { mapColors as c } from '@/theme/tokens';

/**
 * Terrain basemap layers (birdbrain-map-style spec §2–3, draft style JSON),
 * mapped from the draft's OpenMapTiles names to the Protomaps v4 schema:
 *   transportation → roads, place → places, waterway → water (lines),
 *   and `class` → `kind` (+ `kind_detail`) in every filter.
 * Colors, widths and fonts are designer's. Every layer carries
 * metadata.group = 'terrain' so the base toggle can hide the whole group
 * (hidden layers stop fetching DEM and contour tiles).
 */
export const FONT = { label: ['Inter Medium'], water: ['Inter Medium Italic'], sgl: ['Barlow Condensed Bold'] } as const;

type Layer = Record<string, unknown> & { id: string };

const reliefColor = ['interpolate', ['linear'], ['elevation'], ...c.reliefStopsM.flatMap((m, i) => [m, c.relief[i]])];
const isPolygon = ['==', ['geometry-type'], 'Polygon'];
const isLine = ['==', ['geometry-type'], 'LineString'];
const hidden = { visibility: 'none' } as const;

export function terrainLayers(): Layer[] {
  const meta = { group: 'terrain' };
  const layers: Layer[] = [
    { id: 'terrain-bg', type: 'background', paint: { 'background-color': c.bg } },
    { id: 'terrain-tint', type: 'color-relief', source: 'dem', paint: { 'color-relief-color': reliefColor } },
    {
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 12, 0.5, 15, 0.6],
        'hillshade-shadow-color': c.hillshade.shadow,
        'hillshade-highlight-color': c.hillshade.highlight,
        'hillshade-accent-color': c.hillshade.accent,
      },
    },
    { id: 'terrain-water', type: 'fill', source: 'protomaps', 'source-layer': 'water', filter: isPolygon, paint: { 'fill-color': c.water.fill } },
    {
      id: 'terrain-streams',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'water',
      minzoom: 12,
      filter: ['all', isLine, ['in', ['get', 'kind'], ['literal', ['river', 'stream', 'canal', 'ditch', 'drain']]]],
      paint: { 'line-color': c.water.line, 'line-width': 0.8 },
    },
    {
      id: 'contour-minor',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 12,
      filter: ['==', ['get', 'level'], 0],
      paint: { 'line-color': c.contour.minor, 'line-opacity': c.contour.minorOpacity, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 0.9] },
    },
    {
      id: 'contour-major',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 11,
      filter: ['>', ['get', 'level'], 0],
      paint: { 'line-color': c.contour.major, 'line-opacity': c.contour.majorOpacity, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.4, 15, 1.8] },
    },
    {
      id: 'contour-label',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['>', ['get', 'level'], 0],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' ft'],
        'text-font': FONT.label,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 15, 11],
      },
      paint: { 'text-color': c.contour.label, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    },
    // Protomaps v4: motorway/trunk = highway; primary/secondary/tertiary = major_road (kind_detail keeps the OSM class).
    {
      id: 'roads-major',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'roads',
      filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road', 'medium_road']]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': c.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 15, 2.5] },
    },
    {
      id: 'roads-track',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'roads',
      minzoom: 13,
      // Checked against the 2026-10-22 PA extract: residential/unclassified/service are minor_road; tracks are path + kind_detail track.
      filter: ['any', ['==', ['get', 'kind'], 'minor_road'], ['all', ['==', ['get', 'kind'], 'path'], ['==', ['get', 'kind_detail'], 'track']]],
      paint: {
        'line-color': c.road,
        'line-opacity': 0.5,
        'line-width': 0.8,
        'line-dasharray': ['case', ['==', ['get', 'kind_detail'], 'track'], ['literal', [3, 2]], ['literal', [1, 0]]],
      },
    },
    {
      id: 'road-labels',
      type: 'symbol',
      source: 'protomaps',
      'source-layer': 'roads',
      minzoom: 14,
      filter: ['has', 'name'],
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT.label, 'text-size': 10 },
      paint: { 'text-color': c.road, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'water-labels',
      type: 'symbol',
      source: 'protomaps',
      'source-layer': 'water',
      minzoom: 12,
      filter: ['all', isLine, ['has', 'name']],
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT.water, 'text-size': 10 },
      paint: { 'text-color': c.water.line, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'protomaps',
      'source-layer': 'places',
      // Towns only; no hamlets/villages below z11.
      filter: [
        'all',
        ['==', ['get', 'kind'], 'locality'],
        ['any', ['in', ['get', 'kind_detail'], ['literal', ['city', 'town']]], ['>=', ['zoom'], 11]],
      ],
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT.label, 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 13] },
      paint: { 'text-color': c.place, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    },
  ];
  return layers.map((l) => ({ ...l, layout: { ...((l.layout as object) ?? {}), ...hidden }, metadata: meta }));
}

/** Sources for Terrain. demUrl/contourUrl are maplibre-contour protocol URLs built in the page. */
export function terrainSources(o: { pmtiles: string; demUrl: string; contourUrl: string; demMaxzoom: number; demAttribution: string }) {
  return {
    dem: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: o.demMaxzoom, tiles: [o.demUrl], attribution: o.demAttribution },
    contours: { type: 'vector', maxzoom: 15, tiles: [o.contourUrl] },
    protomaps: { type: 'vector', url: `pmtiles://${o.pmtiles}`, attribution: '© OpenStreetMap contributors · Protomaps' },
  };
}

/** Selected place: orange line over a dark casing, no fill of any kind (spec §7). */
export function selectedOutlineLayers(): Layer[] {
  return [
    { id: 'outline-casing', type: 'line', source: 'outline', layout: { 'line-join': 'round' }, paint: { 'line-color': c.selected.casing, 'line-width': c.selected.casingWidth, 'line-opacity': 0.9 } },
    { id: 'outline-line', type: 'line', source: 'outline', layout: { 'line-join': 'round' }, paint: { 'line-color': c.selected.line, 'line-width': c.selected.width } },
  ];
}
