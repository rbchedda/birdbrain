import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

import { buildMapHtml } from '@/components/map/mapHtml';
import { FONT, selectedOutlineLayers, terrainLayers, terrainSources } from '@/components/map/terrainStyle';
import { CONTOUR_THRESHOLDS_FT, DEM_ATTRIBUTION, DEM_MAXZOOM, mapAssetsFrom } from '@/lib/mapConfig';
import { mapColors } from '@/theme/tokens';

const assets = mapAssetsFrom('http://192.168.1.20:8787/')!;
const style = () => ({
  version: 8,
  glyphs: assets.glyphs,
  sources: {
    ...terrainSources({ pmtiles: assets.pmtiles, demUrl: 'dem-shared://{z}/{x}/{y}', contourUrl: 'dem-contour://{z}/{x}/{y}', demMaxzoom: DEM_MAXZOOM, demAttribution: DEM_ATTRIBUTION }),
    outline: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [...terrainLayers(), ...selectedOutlineLayers()],
});

describe('Terrain style', () => {
  it('validates against the MapLibre 5.24 style spec (24.10)', () => {
    expect(validateStyleMin(style() as never)).toEqual([]);
  });

  it('uses the Protomaps schema (kind, not class) and the three hosted fontstacks', () => {
    const json = JSON.stringify(terrainLayers());
    for (const omt of ['"transportation"', '"waterway"', '"place"', '"class"']) expect(json).not.toContain(omt);
    const layers = new Set(terrainLayers().map((l) => l['source-layer']).filter(Boolean));
    expect([...layers].sort()).toEqual(['contours', 'places', 'roads', 'water']);
    const fonts = new Set(terrainLayers().flatMap((l) => ((l.layout as { 'text-font'?: string[] })?.['text-font'] ?? [])));
    expect([...fonts].sort()).toEqual(['Inter Medium', 'Inter Medium Italic']);
    expect(FONT.sgl).toEqual(['Barlow Condensed Bold']);
  });

  it('keeps designer colors: ember contours, never stocking orange; relief stops 100–900 m', () => {
    const byId = Object.fromEntries(terrainLayers().map((l) => [l.id, l]));
    const paint = (id: string) => byId[id].paint as Record<string, unknown>;
    expect(paint('contour-major')['line-color']).toBe('#D96A35');
    expect(paint('contour-minor')['line-color']).toBe('#FFA270');
    expect(JSON.stringify(terrainLayers())).not.toContain('#FF6A1F');
    expect(paint('terrain-tint')['color-relief-color']).toEqual(['interpolate', ['linear'], ['elevation'], 100, '#0E1A13', 250, '#142A1E', 400, '#1C3828', 550, '#264733', 700, '#355A41', 900, '#4A6E52']);
    expect(paint('terrain-hillshade')['hillshade-illumination-direction']).toBe(315);
  });

  it('shows tracks (path + kind_detail track) dashed, but not footpaths', () => {
    const track = terrainLayers().find((l) => l.id === 'roads-track')!;
    expect(JSON.stringify(track.filter)).toContain('"track"');
    expect(JSON.stringify(track.filter)).not.toContain('footway');
  });

  it('contours are 20/100 ft from z15, in feet', () => {
    expect(CONTOUR_THRESHOLDS_FT[15]).toEqual([20, 100]);
    expect(CONTOUR_THRESHOLDS_FT[11]).toEqual([500, 500]);
  });

  it('starts hidden, so Terrain fetches nothing until chosen', () => {
    for (const l of terrainLayers()) expect(l.layout).toMatchObject({ visibility: 'none' });
  });

  it('draws the selected place as an orange line with a dark casing and no fill', () => {
    const out = selectedOutlineLayers();
    expect(out.map((l) => l.type)).toEqual(['line', 'line']);
    expect((out[1].paint as Record<string, unknown>)['line-color']).toBe(mapColors.selected.line);
    expect(mapColors.selected.line).toBe('#FF6A1F');
  });
});

describe('map page', () => {
  it('shares one DEM fetch via sharedDemProtocolUrl at maxzoom 12 and reads URLs from config', () => {
    const html = buildMapHtml(assets);
    expect(html).toContain('demSource.sharedDemProtocolUrl');
    expect(html).toContain('contourProtocolUrl');
    expect(html).toContain('"demMaxzoom":12');
    expect(html).toContain('http://192.168.1.20:8787/dem/{z}/{x}/{y}.png');
    expect(html).toContain('http://192.168.1.20:8787/basemap/pa.pmtiles');
    expect(html).toContain('http://192.168.1.20:8787/fonts/{fontstack}/{range}.pbf');
    expect(html).not.toMatch(/r2\.dev|cloudflarestorage/);
    expect(html).not.toContain("'outline-fill'");
    expect(html).toContain('USGSImageryOnly');
  });

  it('without a configured host, ships no Terrain code and falls back to topo', () => {
    const html = buildMapHtml(null);
    expect(html).not.toContain('pmtiles.js');
    expect(html).toContain('var terrain = null');
    expect(mapAssetsFrom('')).toBeNull();
    expect(mapAssetsFrom('ftp://x')).toBeNull();
  });
});
