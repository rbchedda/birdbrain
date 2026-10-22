import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderHook, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { offlineLayers, mapHtml } from '@/components/map/mapHtml';
import { backend } from '@/data';
import { loadPlaces } from '@/data/hooks';
import { MAP_BANNER_SHORT } from '@/data/mapNotice';
import { samplePlaces } from '@/data/places';
import { canUse, FREE_STATE, isPremium, SAFETY_FEATURES } from '@/entitlements';
import { OfflineGateError, PackDownloader } from '@/offline/downloader';
import { areaPack, planPack, sglPack, type PackManifest, type PackSpec } from '@/offline/packs';
import { cachedOutline, cachedSafetyPlaces, saveOutline, saveSafetyPlaces, withOfflineOutline } from '@/offline/safetyCache';
import {
  assertCacheable,
  isCacheableTileUrl,
  PACK_SOURCES,
  terrainPackSources,
  UncacheableSourceError,
} from '@/offline/sources';
import type { TileStore } from '@/offline/store';
import { serveTile } from '@/offline/tileServer';
import { countTiles } from '@/offline/tiles';

declare function require(name: 'fs'): { readdirSync(p: string): string[]; readFileSync(p: string, e: 'utf8'): string };
declare function require(name: 'path'): { join(...p: string[]): string };
declare const __dirname: string;

/** In-memory TileStore; `gate` lets a test hold downloads mid-flight. */
function memoryStore(opts: { fail?: (url: string) => boolean; delay?: () => Promise<void> } = {}) {
  const files = new Map<string, number>();
  let manifests: Record<string, PackManifest> = {};
  const calls: string[] = [];
  const store: TileStore & { files: typeof files; calls: string[] } = {
    supported: true,
    files,
    calls,
    async download(url, path) {
      calls.push(url);
      await opts.delay?.();
      if (opts.fail?.(url)) throw new Error('HTTP 500');
      files.set(path, 1000);
      return 1000;
    },
    exists: async (p) => files.has(p),
    size: async (p) => files.get(p) ?? 0,
    readBase64: async (p) => (files.has(p) ? 'AAEC' : null),
    async remove(dir) {
      for (const k of [...files.keys()]) if (k.startsWith(`${dir}/`)) files.delete(k);
    },
    readManifests: async () => manifests,
    writeManifests: async (m) => void (manifests = m),
  };
  return store;
}

// A small game-land box: ~1 km across, so every test pack is a few hundred tiles at most.
const spec: PackSpec = areaPack('SGL test', { lng: -77.5, lat: 40.8 }, 0.5, ['topo']);

// The device store, as a phone would have it (jest runs the web/native split unevenly).
const mockDevice: { manifests: Record<string, PackManifest> } = { manifests: {} };
jest.mock('@/offline/fileTileStore', () => ({
  fileTileStore: {
    supported: true,
    download: async () => 0,
    exists: async () => false,
    size: async () => 0,
    readBase64: async () => null,
    remove: async () => {},
    readManifests: async () => mockDevice.manifests,
    writeManifests: async () => {},
  },
}));

describe('offline sources: Esri is never cached', () => {
  const esri = [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/6100/4600',
    'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/1/0/0',
    'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/1/0/0',
    'https://tiles.arcgis.com/tiles/x/arcgis/rest/services/y/MapServer/tile/1/0/0',
    'https://basemaps.esri.com/tile/1/0/0',
    'https://SERVER.ArcGISOnline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/1/0/0',
  ];

  it('refuses every Esri host, by host not by path', () => {
    for (const url of esri) {
      expect(isCacheableTileUrl(url)).toBe(false);
      expect(() => assertCacheable(url)).toThrow(UncacheableSourceError);
    }
    // USGS paths contain /arcgis/rest/services and are public domain: allowed.
    expect(isCacheableTileUrl('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/1/0/0')).toBe(true);
  });

  it('is an allowlist: unknown hosts, http, and lookalikes are refused', () => {
    for (const url of [
      'http://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/1/0/0',
      'https://tile.openstreetmap.org/1/0/0.png',
      'https://api.maptiler.com/tiles/satellite/1/0/0.jpg',
      'https://basemap.nationalmap.gov.evil.example/x',
      'https://s3.amazonaws.com/some-other-bucket/1/0/0.png',
      'bboffline://topo/1/0/0',
    ]) {
      expect(isCacheableTileUrl(url)).toBe(false);
    }
    expect(isCacheableTileUrl('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/1/0/0.png')).toBe(true);
  });

  it('every pack source and the map page offline fallbacks are cacheable, with satellite capped at z15', () => {
    for (const s of Object.values(PACK_SOURCES)) expect(isCacheableTileUrl(s.url)).toBe(true);
    for (const l of Object.values(offlineLayers)) expect(isCacheableTileUrl(l.network)).toBe(true);
    expect(PACK_SOURCES.satellite.maxzoom).toBe(15);
    expect(PACK_SOURCES.topo.maxzoom).toBe(16);
    expect(mapHtml).toMatch(/'satellite-offline': \{ type: 'raster', tileSize: 256, maxzoom: 15,/);
  });

  it('the downloader refuses an Esri source before making any request', async () => {
    const store = memoryStore();
    const real = PACK_SOURCES.satellite.url;
    (PACK_SOURCES.satellite as { url: string }).url =
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    try {
      const d = new PackDownloader(store);
      expect(() => d.download({ ...spec, basemaps: ['satellite'] }, true)).toThrow(UncacheableSourceError);
      expect(store.calls).toEqual([]);
    } finally {
      (PACK_SOURCES.satellite as { url: string }).url = real;
    }
  });

  it('no offline module names an Esri host outside the blocklist', () => {
    const { readdirSync, readFileSync } = require('fs');
    const { join } = require('path');
    const dir = join(__dirname, '..', 'offline');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/BLOCKED_HOST_SUFFIXES = \[[^\]]*\]/, '');
      expect(src).not.toMatch(/arcgisonline|World_Imagery/i);
    }
  });

  it('terrain packs are a pending seam until basemap PR 2', () => {
    expect(terrainPackSources()).toBeNull();
  });
});

describe('offline packs: gating', () => {
  it('offlineMaps is premium; safety features stay free', () => {
    expect(isPremium('offlineMaps')).toBe(true);
    expect(canUse('offlineMaps', FREE_STATE)).toBe(false);
    expect(canUse('offlineMaps', { active: ['season_pass'], seasonPassExpiresAt: Date.now() + 1e9 })).toBe(true);
    for (const f of SAFETY_FEATURES) expect(canUse(f, FREE_STATE)).toBe(true);
  });

  it('a download without the entitlement throws and fetches nothing', () => {
    const store = memoryStore();
    const d = new PackDownloader(store);
    expect(() => d.download(spec, false)).toThrow(OfflineGateError);
    expect(store.calls).toEqual([]);
  });

  it('the map gets no offline source without the entitlement', async () => {
    mockDevice.manifests = {
      [spec.id]: { spec, status: 'complete', total: 1, done: 1, bytes: 1, failed: 0, updatedAt: 0 },
    };
    const { useOfflineMapSource } = require('@/offline') as typeof import('@/offline');
    const free = await renderHook(() => useOfflineMapSource(false));
    expect(free.result.current).toBeUndefined();
    const paid = await renderHook(() => useOfflineMapSource(true));
    await waitFor(() => expect(paid.result.current?.basemaps).toEqual(['topo']));
    mockDevice.manifests = {};
  });
});

describe('offline packs: download state', () => {
  it('estimates size before download from the tile count', () => {
    const plan = planPack({ ...spec, basemaps: ['topo', 'satellite'] });
    const topo = countTiles(spec.bbox, 10, 16);
    const sat = countTiles(spec.bbox, 10, 15);
    expect(plan.tiles).toBe(topo + sat);
    expect(plan.estBytes).toBe(topo * 33_000 + sat * 27_000);
    // A typical SGL (no outline loaded: ±4.5 km) is in the scope doc's ~15-30 MB range.
    const sgl = planPack(sglPack(samplePlaces[0], null, ['topo']));
    expect(sgl.estBytes).toBeGreaterThan(10e6);
    expect(sgl.estBytes).toBeLessThan(40e6);
  });

  it('downloads every tile with progress, then completes', async () => {
    const store = memoryStore();
    const d = new PackDownloader(store);
    const seen: number[] = [];
    d.subscribe((m) => m[spec.id] && seen.push(m[spec.id].done));
    const m = await d.download(spec, true).done;
    expect(m.status).toBe('complete');
    expect(m.done).toBe(m.total);
    expect(store.calls).toHaveLength(m.total);
    expect(m.bytes).toBe(m.total * 1000);
    expect(new Set(seen).size).toBeGreaterThan(m.total / 2);
    expect(store.calls.every((u) => u.startsWith('https://basemap.nationalmap.gov/'))).toBe(true);
  });

  it('cancel leaves a paused pack; resume skips tiles already on disk', async () => {
    let n = 0;
    let handle: { cancel(): void } | null = null;
    const store = memoryStore({
      delay: async () => {
        if (++n === 20) handle?.cancel();
      },
    });
    const d = new PackDownloader(store, { concurrency: 2 });
    const h = d.download(spec, true);
    handle = h;
    const paused = await h.done;
    expect(paused.status).toBe('paused');
    expect(paused.done).toBeLessThan(paused.total);
    expect(d.isRunning(spec.id)).toBe(false);
    const firstCalls = store.calls.length;

    const resumed = await d.download(spec, true).done;
    expect(resumed.status).toBe('complete');
    expect(resumed.done).toBe(resumed.total);
    // Each tile fetched exactly once across both runs.
    expect(store.calls.length).toBe(resumed.total);
    expect(new Set(store.calls).size).toBe(store.calls.length);
    expect(firstCalls).toBeGreaterThan(0);
  });

  it('a restart turns an interrupted download into a resumable paused pack', async () => {
    const store = memoryStore();
    await store.writeManifests({ [spec.id]: { spec, status: 'downloading', total: 10, done: 3, bytes: 3, failed: 0, updatedAt: 0 } });
    const d = new PackDownloader(store);
    await d.load();
    expect(d.list()[spec.id].status).toBe('paused');
  });

  it('failed tiles mark the pack errored and resume retries only those', async () => {
    let flaky = true;
    const store = memoryStore({ fail: (u) => flaky && u.includes('/16/') });
    const d = new PackDownloader(store);
    const bad = await d.download(spec, true).done;
    expect(bad.status).toBe('error');
    expect(bad.failed).toBeGreaterThan(0);
    const before = store.calls.length;
    flaky = false;
    const good = await d.download(spec, true).done;
    expect(good.status).toBe('complete');
    expect(store.calls.length - before).toBe(bad.failed);
  });

  it('delete removes the files and the manifest, and refuses a second concurrent run', async () => {
    const store = memoryStore();
    const d = new PackDownloader(store);
    const h = d.download(spec, true);
    expect(() => d.download(spec, true)).toThrow(/already downloading/);
    await h.done;
    expect(store.files.size).toBeGreaterThan(0);
    await d.delete(spec.id);
    expect(store.files.size).toBe(0);
    expect(d.list()[spec.id]).toBeUndefined();
    expect((await store.readManifests())[spec.id]).toBeUndefined();
  });

  it('serves stored tiles over bboffline:// and misses fall through to the network', async () => {
    const store = memoryStore();
    const d = new PackDownloader(store);
    await d.download(spec, true).done;
    const [path] = [...store.files.keys()].filter((k) => k.includes('/topo/14/'));
    const [, , z, x, y] = path.split('/');
    expect(await serveTile(`bboffline://topo/${z}/${x}/${y}`, d.list(), store)).toBe('AAEC');
    expect(await serveTile('bboffline://topo/14/0/0', d.list(), store)).toBeNull();
    expect(await serveTile(`bboffline://satellite/${z}/${x}/${y}`, d.list(), store)).toBeNull();
    expect(await serveTile('https://example.com/1/0/0', d.list(), store)).toBeNull();
  });
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const mapProps: { outline?: unknown; offline?: unknown; places?: unknown[] }[] = [];
jest.mock('@/components/map/PlaceMap', () => {
  const { View } = require('react-native');
  return {
    PlaceMap: (p: never) => {
      mapProps.push(p);
      return <View testID="place-map" />;
    },
  };
});

describe('Offline maps screen', () => {
  it('free users see the pass prompt, not downloads; the free safety note is always shown', async () => {
    await act(() => loadPlaces(true));
    await renderRouter('./src/app', { initialUrl: '/offline-maps' });
    expect(await screen.findByTestId('gated-offlineMaps')).toBeTruthy();
    expect(screen.getByText(/keep working offline for places you have opened\. That is\s+free\./)).toBeTruthy();
    expect(screen.queryByText('Download')).toBeNull();
  });

  it('is linked from Settings', async () => {
    await renderRouter('./src/app', { initialUrl: '/profile/settings' });
    await fireEvent.press(await screen.findByLabelText(/^Offline maps:/));
    expect(await screen.findByTestId('gated-offlineMaps')).toBeTruthy();
  });
});

describe('safety overlays offline (free)', () => {
  afterEach(() => AsyncStorage.clear());

  it('outlines are cached on view and returned when the network fails', async () => {
    const geom = { type: 'Polygon', coordinates: [[[-77, 40], [-77.1, 40], [-77.1, 40.1], [-77, 40]]] } as const;
    await withOfflineOutline('sgl-1', async () => ({ stocking: [], outline: geom as never }));
    await waitFor(async () => expect(await cachedOutline('sgl-1')).toEqual(geom));
    const offline = await withOfflineOutline('sgl-1', () => Promise.reject(new Error('Network request failed')));
    expect(offline.outline).toEqual(geom);
    await expect(withOfflineOutline('never-seen', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  });

  it('with no network and no pass, the map still gets places and the outline, and the banner shows', async () => {
    const place = samplePlaces.find((p) => p.type === 'game_land')!;
    const geom = { type: 'Polygon', coordinates: [[[-77, 40], [-77.1, 40], [-77.1, 40.1], [-77, 40]]] };
    await saveSafetyPlaces(samplePlaces);
    await saveOutline(place.id, geom as never);
    expect((await cachedSafetyPlaces()).length).toBe(samplePlaces.length);

    const list = jest.spyOn(backend, 'listPlaces').mockRejectedValue(new Error('Network request failed'));
    const detail = jest.spyOn(backend, 'placeDetail').mockRejectedValue(new Error('Network request failed'));
    try {
      await act(() => loadPlaces(true));
      await renderRouter('./src/app', { initialUrl: '/' });
      expect(await screen.findByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
      await waitFor(() => expect(mapProps.at(-1)?.places?.length).toBe(samplePlaces.length));
      const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
      if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
      await fireEvent.press(await screen.findByLabelText(place.name));
      await waitFor(() => expect(mapProps.at(-1)?.outline).toEqual(geom));
      expect(mapProps.at(-1)?.offline).toBeUndefined();
    } finally {
      list.mockRestore();
      detail.mockRestore();
    }
  });
});
