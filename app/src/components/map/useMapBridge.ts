import { useCallback, useEffect, useState } from 'react';

import { placeToday } from '@/data/seasons';
import { pointInGeometry } from '@/lib/geo';
import { stateParksGeoJSON } from '@/data/stateParks';

import type { PlaceMapProps } from './types';

type Outbound = Record<string, unknown> & { type: string };
type Inbound =
  | { type: 'ready' }
  | { type: 'select'; id: string | null }
  | { type: 'selectPark'; id: string }
  | { type: 'emptyTap'; lngLat?: unknown }
  | { type: 'center'; center?: unknown }
  | { type: 'error'; message: string }
  | { type: 'tile'; id: number; url: string };

/**
 * Keeps the map page in sync with props. `post` delivers a message to the
 * page; the returned `receive` handles messages coming back.
 */
export function useMapBridge(post: (m: Outbound) => void, props: PlaceMapProps) {
  const { places, selectedId, outline, basemap, focus, onSelect, onSelectPark, onEmptyTap, me, offline, ranks, fit, onCenterChange } = props;
  const offlineKey = (offline?.basemaps ?? []).join(',');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!ready) return;
    const now = new Date();
    post({
      type: 'places',
      data: {
        type: 'FeatureCollection',
        features: places.map((p) => ({
          type: 'Feature',
          properties: { id: p.id, type: p.type, open: placeToday(p, now).open, rank: ranks?.[p.id] ?? 0 },
          geometry: { type: 'Point', coordinates: [p.center.lng, p.center.lat] },
        })),
      },
    });
  }, [ready, places, ranks, post]);

  useEffect(() => {
    if (ready && fit) post({ type: 'fit', bounds: fit.bounds });
  }, [ready, fit, post]);

  useEffect(() => {
    if (ready) post({ type: 'parks', data: stateParksGeoJSON() });
  }, [ready, post]);

  useEffect(() => {
    if (ready) post({ type: 'select', id: selectedId ?? null });
  }, [ready, selectedId, post]);

  useEffect(() => {
    if (ready) post({ type: 'outline', geometry: outline ?? null });
  }, [ready, outline, post]);

  useEffect(() => {
    if (ready) post({ type: 'basemap', name: basemap });
  }, [ready, basemap, post]);

  useEffect(() => {
    if (ready) post({ type: 'offline', basemaps: offlineKey ? offlineKey.split(',') : [] });
  }, [ready, offlineKey, post]);

  useEffect(() => {
    if (ready && focus) post({ type: 'focus', center: [focus.center.lng, focus.center.lat], zoom: focus.zoom ?? 11 });
  }, [ready, focus, post]);

  useEffect(() => {
    if (ready) post(meMessage(me));
  }, [ready, me, post]);

  const receive = useCallback(
    (raw: string) => {
      let m: Inbound;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
      if (m.type === 'ready') setReady(true);
      if (m.type === 'select') onSelect(m.id);
      if (m.type === 'selectPark') onSelectPark?.(m.id);
      if (m.type === 'emptyTap') {
        // Inside the selected land's boundary counts as a boundary tap, not empty map.
        const ll = Array.isArray(m.lngLat) && m.lngLat.length === 2 && m.lngLat.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (m.lngLat as [number, number]) : null;
        if (ll && outline && pointInGeometry(ll[0], ll[1], outline)) return;
        if (onEmptyTap) onEmptyTap();
        else onSelect(null);
      }
      if (m.type === 'center') {
        const c = isLngLat(m.center) ? m.center : null;
        if (c) onCenterChange?.({ lng: c[0], lat: c[1] });
      }
      if (m.type === 'error') setError(m.message);
      if (m.type === 'tile') {
        const get = offline?.getTile ?? (async () => null);
        get(m.url).then(
          (data) => post({ type: 'tileData', id: m.id, data }),
          () => post({ type: 'tileData', id: m.id, data: null }),
        );
      }
    },
    [onSelect, onSelectPark, onEmptyTap, onCenterChange, outline, offline, post],
  );

  return { receive, error, ready };
}

/** A finite [lng, lat] pair inside the world's bounds. */
export const isLngLat = (v: unknown): v is [number, number] =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  Math.abs(v[0] as number) <= 180 &&
  Math.abs(v[1] as number) <= 90;

/** Bridge message for the user's position; accuracy is meters (0 when unknown). */
export function meMessage(me: PlaceMapProps['me']) {
  return me
    ? { type: 'me', center: [me.lng, me.lat], accuracy: Math.max(0, me.accuracy ?? 0) }
    : { type: 'me', center: null, accuracy: 0 };
}
