import { useCallback, useEffect, useState } from 'react';

import { placeToday } from '@/data/seasons';

import type { PlaceMapProps } from './types';

type Outbound = Record<string, unknown> & { type: string };
type Inbound = { type: 'ready' } | { type: 'select'; id: string | null } | { type: 'error'; message: string };

/**
 * Keeps the map page in sync with props. `post` delivers a message to the
 * page; the returned `receive` handles messages coming back.
 */
export function useMapBridge(post: (m: Outbound) => void, props: PlaceMapProps) {
  const { places, selectedId, outline, basemap, focus, onSelect, me } = props;
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
    if (ready) post({ type: 'select', id: selectedId ?? null });
  }, [ready, selectedId, post]);

  useEffect(() => {
    if (ready) post({ type: 'outline', geometry: outline ?? null });
  }, [ready, outline, post]);

  useEffect(() => {
    if (ready) post({ type: 'basemap', name: basemap });
  }, [ready, basemap, post]);

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
      if (m.type === 'ready') setReady(true);
      if (m.type === 'select') onSelect(m.id);
      if (m.type === 'error') setError(m.message);
    },
    [onSelect],
  );

  return { receive, error, ready };
}

/** Bridge message for the user's position; accuracy is meters (0 when unknown). */
export function meMessage(me: PlaceMapProps['me']) {
  return me
    ? { type: 'me', center: [me.lng, me.lat], accuracy: Math.max(0, me.accuracy ?? 0) }
    : { type: 'me', center: null, accuracy: 0 };
}
