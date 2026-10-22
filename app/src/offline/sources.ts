import { offlineLayers, USGS } from '@/components/map/mapHtml';
import type { Basemap } from '@/components/map/types';

/**
 * Which tile sources may be stored on the device for offline use.
 *
 * Only sources whose terms allow caching are listed (basemap-toggle-scope.md §4):
 * - USGS The National Map (public domain).
 * - Our own R2 copy (Protomaps PMTiles extract), configured by EXPO_PUBLIC_OFFLINE_R2_BASE.
 * - AWS Open Data terrain tiles (Mapzen/Tilezen DEM).
 *
 * Esri World Imagery is NEVER cached: its terms say "Not intended to be used to
 * export tiles for offline". The check is by host, not by path: USGS's own URLs
 * contain "/arcgis/rest/services" and are allowed. Anything not on the allowlist is
 * refused, so a new source has to be added here deliberately.
 */
export const BLOCKED_HOST_SUFFIXES = ['arcgisonline.com', 'arcgis.com', 'esri.com'];

const R2_BASE = (process.env.EXPO_PUBLIC_OFFLINE_R2_BASE ?? '').trim();

export function allowedHosts(): string[] {
  const hosts = ['basemap.nationalmap.gov', 's3.amazonaws.com', 'elevation-tiles-prod.s3.amazonaws.com'];
  const r2 = hostOf(R2_BASE);
  // A misconfigured R2 base can never add a blocked (Esri) host.
  if (r2 && !isBlockedHost(r2)) hosts.push(r2);
  return hosts;
}

export function hostOf(url: string): string | null {
  const m = /^https:\/\/([^/:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

const matchesSuffix = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`);

export function isBlockedHost(host: string): boolean {
  return BLOCKED_HOST_SUFFIXES.some((s) => matchesSuffix(host, s));
}

/** True only for https URLs on an allowlisted host that is not Esri. */
export function isCacheableTileUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host || isBlockedHost(host)) return false;
  if (host === 's3.amazonaws.com' && !/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\//i.test(url)) return false;
  return allowedHosts().includes(host);
}

export class UncacheableSourceError extends Error {
  constructor(url: string) {
    super(`Tile source is not allowed offline: ${hostOf(url) ?? url}`);
    this.name = 'UncacheableSourceError';
  }
}

export function assertCacheable(url: string) {
  if (!isCacheableTileUrl(url)) throw new UncacheableSourceError(url);
}

export interface OfflineSource {
  /** Folder name in the pack and the bboffline:// host. */
  key: string;
  basemap: Basemap;
  /** {z}/{x}/{y} template, must pass assertCacheable. */
  url: string;
  minzoom: number;
  maxzoom: number;
  /** Planning figure for the size estimate (scope §4 samples), not a measurement. */
  estBytesPerTile: number;
  attribution: string;
}

export type PackBasemap = 'topo' | 'satellite';

/** Phase 1 sources. Satellite is capped at z15 to keep packs small (z16 is ~4x the tiles). */
export const PACK_SOURCES: Record<PackBasemap, OfflineSource> = {
  topo: {
    key: 'topo',
    basemap: 'topo',
    url: `${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}`,
    minzoom: 10,
    maxzoom: offlineLayers.topo.maxzoom,
    estBytesPerTile: 33_000,
    attribution: 'USGS The National Map',
  },
  satellite: {
    key: 'satellite',
    basemap: 'satellite',
    url: `${USGS}/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`,
    minzoom: 10,
    maxzoom: offlineLayers.satellite.maxzoom,
    estBytesPerTile: 27_000,
    attribution: 'USGS The National Map: Orthoimagery',
  },
};

export const PACK_BASEMAPS = Object.keys(PACK_SOURCES) as PackBasemap[];

/**
 * Terrain seam: basemap PR 2 brings vector tiles, a DEM and glyphs. When it lands,
 * return those sources here (R2 PMTiles extract, AWS terrain DEM, our glyph copy),
 * each still passing assertCacheable. Until then Terrain packs are not offered.
 */
export function terrainPackSources(): OfflineSource[] | null {
  return null;
}

export function tileUrl(source: OfflineSource, z: number, x: number, y: number) {
  return source.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

// Fail at import if someone points a pack source at a host we may not cache.
for (const s of Object.values(PACK_SOURCES)) assertCacheable(s.url);
