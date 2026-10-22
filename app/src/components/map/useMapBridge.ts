import { useCallback, useEffect, useState } from 'react';

import { placeToday } from '@/data/seasons';
import { stateParksGeoJSON } from '@/data/stateParks';

import type { PlaceMapProps } from './types';

type Outbound = Record<string, unknown> & { type: string };
type Inbound =
  | { type: 'ready' }
  | { type: 'select'; id: string | null }
  | { type: 'selectPark'; id: string }
  | { type: 'error'; message: string }
  | { type: 'tile'; id: number; url: string };

/**
 * Keeps the map page in sync with props. `post` delivers a message to the
 * page; the returned `receive` handles messages coming back.
 */
export function useMapBridge(post: (m: Outbound) => void, props: PlaceMapProps) {
  const { places, selectedId, outline, basemap, focus, onSelect, onSelectPark, offline } = props;
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
          properties: { id: p.id, type: p.type, open: placeToday(p, now).open },
          geometry: { type: 'Point', coordinates: [p.center.lng, p.center.lat] },
        })),
      },
    });
  }, [ready, places, post]);

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
    if (ready && focus) post({ type: 'focus', center: [focus.center.lng, focus.center.lat] });
  }, [ready, focus, post]);

  const receive = useCallback(
    (raw: string) => {
      let m: Inbound;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.type === 'ready') setReady(true);
      if (m.type === 'select') onSelect(m.id);
      if (m.type === 'selectPark') onSelectPark?.(m.id);
      if (m.type === 'error') setError(m.message);
      if (m.type === 'tile') {
        const get = offline?.getTile ?? (async () => null);
        get(m.url).then(
          (data) => post({ type: 'tileData', id: m.id, data }),
          () => post({ type: 'tileData', id: m.id, data: null }),
        );
      }
    },
    [onSelect, onSelectPark, offline, post],
  );

  return { receive, error, ready };
}
