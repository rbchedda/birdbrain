import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapError } from './MapError';
import { mapHtml } from './mapHtml';
import type { PlaceMapProps } from './types';
import { useMapBridge } from './useMapBridge';

/** Web: the same MapLibre page as native, in an iframe. */
export function PlaceMap(props: PlaceMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const post = useCallback((m: object) => {
    frame.current?.contentWindow?.postMessage({ birdbrain: JSON.stringify(m) }, '*');
  }, []);
  const { receive, error } = useMapBridge(post, props);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.birdbrain) receive(e.data.birdbrain);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [receive]);

  return (
    <View style={StyleSheet.absoluteFill} testID="place-map">
      <iframe ref={frame} srcDoc={mapHtml} title="Map of public hunting land" style={{ border: 0, width: '100%', height: '100%' }} />
      {error && <MapError message={error} />}
    </View>
  );
}
