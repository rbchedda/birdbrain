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
        originWhitelist={['*']}
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

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.ground },
});
