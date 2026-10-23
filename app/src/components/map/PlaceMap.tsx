import { type ComponentType, type Ref, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';

import { colors } from '@/theme/tokens';

import { MapError } from './MapError';
import { mapHtml } from './mapHtml';
import type { PlaceMapProps } from './types';
import { useMapBridge } from './useMapBridge';

// The package's class typing collapses to `never` under TS 6 (props & undefined).
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/** iOS/Android in Expo Go: MapLibre GL JS inside a WebView. */
export function PlaceMap(props: PlaceMapProps) {
  const ref = useRef<WebViewHandle>(null);
  const post = useCallback((m: object) => {
    ref.current?.injectJavaScript(`window.bbReceive && window.bbReceive(${JSON.stringify(m)}); true;`);
  }, []);
  const { receive, error } = useMapBridge(post, props);

  return (
    <View style={StyleSheet.absoluteFill} testID="place-map">
      <WebView
        ref={ref}
        source={{ html: mapHtml, baseUrl: 'https://birdbrain.local/' }}
        originWhitelist={MAP_ORIGINS}
        onShouldStartLoadWithRequest={(r) => isMapDocument(r.url)}
        onMessage={(e) => receive(e.nativeEvent.data)}
        style={styles.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
      />
      {error && <MapError message={error} />}
    </View>
  );
}

// The map is a local HTML document; tiles load via fetch, not navigation, so nothing
// else ever needs to load as a page inside this WebView.
const MAP_ORIGINS = ['https://birdbrain.local*', 'about:*', 'data:*'];
export function isMapDocument(url: string) {
  return url.startsWith('https://birdbrain.local/') || url.startsWith('about:') || url.startsWith('data:');
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.ground },
});
