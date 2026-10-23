import { renderHook, act } from '@testing-library/react-native';

import { USGS_ATTRIBUTION, basemapLayers, mapHtml } from '@/components/map/mapHtml';
import { basemapOptions, visibleBasemaps, type Basemap } from '@/components/map/types';
import { useMapBridge } from '@/components/map/useMapBridge';
import { MAPLIBRE_VERSION } from '@/components/map/vendor/maplibreGl';

describe('map page', () => {
  it('bundles MapLibre GL JS 5.24 instead of loading it from a CDN', () => {
    expect(MAPLIBRE_VERSION).toBe('5.24.0');
    expect(mapHtml).not.toMatch(/unpkg|jsdelivr|cdnjs/);
    expect(mapHtml).not.toMatch(/<script[^>]+src=/i);
    expect(mapHtml).not.toMatch(/<link[^>]+stylesheet/i);
    expect(mapHtml).toMatch(/maplibregl/);
  });

  it('uses USGS ImageryOnly for satellite at maxzoom 16, with the full USGS credit', () => {
    expect(mapHtml).toContain('USGSImageryOnly/MapServer/tile/{z}/{y}/{x}');
    expect(mapHtml).not.toContain('USGSImageryTopo');
    expect(mapHtml).toMatch(/satellite: \{ type: 'raster', tileSize: 256, maxzoom: 16,/);
    expect(USGS_ATTRIBUTION).toBe('Map services and data available from U.S. Geological Survey, National Geospatial Program.');
    // Once per USGS source: topo and satellite, online and offline (bboffline://) copies.
    expect(mapHtml.split(USGS_ATTRIBUTION).length - 1).toBe(4);
    expect(mapHtml).not.toContain("'USGS The National Map'");
  });

  it('starts with every basemap hidden, then falls back to Standard if none is chosen', () => {
    // Topo stays hidden until the app picks a basemap, so Terrain never fetches USGS tiles.
    expect(mapHtml).toMatch(/\{ id: 'topo', type: 'raster', source: 'topo', layout: \{ visibility: 'none' \} \}/);
    expect(mapHtml).toContain("current = 'topo'");
    expect(mapHtml).toMatch(/\{ id: 'satellite', type: 'raster', source: 'satellite', layout: \{ visibility: 'none' \} \}/);
    expect(basemapLayers.terrain).toEqual([]);
  });
});

describe('basemap options', () => {
  it('Standard / Satellite / Terrain, Terrain on by default (bundled French Creek) and switchable off', () => {
    expect(basemapOptions.map((o) => o.label)).toEqual(['Standard', 'Satellite', 'Terrain']);
    expect(visibleBasemaps().map((o) => o.key)).toEqual(['topo', 'satellite', 'terrain']);
    expect(visibleBasemaps(false).map((o) => o.key)).toEqual(['topo', 'satellite']);
    expect(visibleBasemaps(true).map((o) => o.key)).toEqual(['topo', 'satellite', 'terrain']);
  });
});

describe('bridge', () => {
  it('sends a basemap message once ready and on every change', async () => {
    const post = jest.fn();
    const props = { places: [], basemap: 'topo' as Basemap, onSelect: jest.fn() };
    const { result, rerender } = await renderHook((p: typeof props) => useMapBridge(post, p), { initialProps: props });
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'basemap' }));
    await act(async () => result.current.receive(JSON.stringify({ type: 'ready' })));
    expect(post).toHaveBeenCalledWith({ type: 'basemap', name: 'topo' });
    post.mockClear();
    await rerender({ ...props, basemap: 'satellite' });
    expect(post).toHaveBeenCalledWith({ type: 'basemap', name: 'satellite' });
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'places' }));
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'outline' }));
  });

  it('ignores its own basemap acks from the page', async () => {
    const onSelect = jest.fn();
    const { result } = await renderHook(() => useMapBridge(jest.fn(), { places: [], basemap: 'topo', onSelect }));
    await act(async () => result.current.receive(JSON.stringify({ type: 'basemap', name: 'topo' })));
    expect(onSelect).not.toHaveBeenCalled();
    expect(result.current.error).toBeUndefined();
  });
});

