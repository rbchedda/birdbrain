import type { LngLat } from '@/data/types';

import { PACK_SOURCES, type OfflineSource, type PackBasemap } from './sources';
import { bboxAround, bboxOfGeometry, countTiles, type Bbox } from './tiles';

export type PackKind = 'sgl' | 'area';

export interface PackSpec {
  /** Stable id: sgl-<placeId> or area-<lng>,<lat>-<km>. Also the folder name. */
  id: string;
  kind: PackKind;
  name: string;
  bbox: Bbox;
  basemaps: PackBasemap[];
  placeId?: string;
}

export type PackStatus = 'downloading' | 'paused' | 'complete' | 'error';

export interface PackManifest {
  spec: PackSpec;
  status: PackStatus;
  total: number;
  done: number;
  /** Bytes actually on disk for this pack. */
  bytes: number;
  failed: number;
  error?: string;
  updatedAt: number;
}

/** Half-width used when a game land's outline is not loaded: covers a typical SGL (~8x9 km). */
export const SGL_FALLBACK_KM = 4.5;
export const AREA_RADII_KM = [3, 5, 10] as const;

/** Pack ids are folder names under the packs root, so they must be one safe path segment. */
const PACK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9.,_-]{0,127}$/;

export class InvalidPackIdError extends Error {
  constructor(id: unknown) {
    super(`Invalid offline pack id: ${JSON.stringify(id)}`);
    this.name = 'InvalidPackIdError';
  }
}

export function isValidPackId(id: unknown): id is string {
  return typeof id === 'string' && PACK_ID_RE.test(id) && !id.includes('..');
}

export function assertPackId(id: unknown): string {
  if (!isValidPackId(id)) throw new InvalidPackIdError(id);
  return id;
}

export function sglPack(place: { id: string; name: string; center: LngLat }, outline: unknown, basemaps: PackBasemap[]): PackSpec {
  return {
    id: assertPackId(`sgl-${place.id}`),
    kind: 'sgl',
    name: place.name,
    bbox: bboxOfGeometry(outline) ?? bboxAround(place.center, SGL_FALLBACK_KM),
    basemaps,
    placeId: place.id,
  };
}

export function areaPack(name: string, center: LngLat, km: number, basemaps: PackBasemap[]): PackSpec {
  return {
    id: assertPackId(`area-${center.lng.toFixed(4)},${center.lat.toFixed(4)}-${km}`),
    kind: 'area',
    name: `${km} km around ${name}`,
    bbox: bboxAround(center, km),
    basemaps,
  };
}

export interface PackPlan {
  sources: { source: OfflineSource; tiles: number; estBytes: number }[];
  tiles: number;
  /** Estimate from per-tile planning figures; actual size shows after download. */
  estBytes: number;
}

export function planPack(spec: PackSpec): PackPlan {
  const sources = spec.basemaps.map((b) => {
    const source = PACK_SOURCES[b];
    const tiles = countTiles(spec.bbox, source.minzoom, source.maxzoom);
    return { source, tiles, estBytes: tiles * source.estBytesPerTile };
  });
  return {
    sources,
    tiles: sources.reduce((n, s) => n + s.tiles, 0),
    estBytes: sources.reduce((n, s) => n + s.estBytes, 0),
  };
}

export function formatBytes(n: number) {
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`;
  return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
}

export function covers(bbox: Bbox, lng: number, lat: number) {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}
