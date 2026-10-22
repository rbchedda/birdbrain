import type { GeoJSONGeometry, Place, PlaceDetail } from '@/data/types';
import { readJson, updateJson, writeJson } from '@/lib/localStore';

/**
 * Safety overlays offline, free for everyone (never gated): the last place list
 * (pins, access labels) and the outlines of game lands you have opened or packed
 * are kept on the device so boundaries still draw with no signal.
 */
const PLACES = 'birdbrain.safety.places.v1';
const OUTLINES = 'birdbrain.safety.outlines.v1';
const MAX_OUTLINES = 60;

export const saveSafetyPlaces = (places: Place[]) => writeJson(PLACES, places);
export const cachedSafetyPlaces = () => readJson<Place[]>(PLACES, []);

type Outlines = Record<string, { geom: GeoJSONGeometry; at: number }>;

export function saveOutline(placeId: string, geom: GeoJSONGeometry | null) {
  if (!geom) return Promise.resolve();
  return updateJson<Outlines>(OUTLINES, {}, (all) => {
    const next = { ...all, [placeId]: { geom, at: Date.now() } };
    const ids = Object.keys(next).sort((a, b) => next[b].at - next[a].at);
    for (const id of ids.slice(MAX_OUTLINES)) delete next[id];
    return next;
  });
}

export async function cachedOutline(placeId: string): Promise<GeoJSONGeometry | null> {
  return (await readJson<Outlines>(OUTLINES, {}))[placeId]?.geom ?? null;
}

/** placeDetail with the outline cached; offline it falls back to the saved outline. */
export async function withOfflineOutline(placeId: string, load: () => Promise<PlaceDetail>): Promise<PlaceDetail> {
  try {
    const d = await load();
    if (d.outline) {
      void saveOutline(placeId, d.outline);
      return d;
    }
    const saved = await cachedOutline(placeId);
    return saved ? { ...d, outline: saved } : d;
  } catch (e) {
    const saved = await cachedOutline(placeId);
    if (saved) return { stocking: [], outline: saved };
    throw e;
  }
}
