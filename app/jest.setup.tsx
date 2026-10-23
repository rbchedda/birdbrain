// Icon fonts load through expo-asset, which has no registry under Jest.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  Icon.glyphMap = {};
  return { Ionicons: Icon };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The map page runs MapLibre GL JS inside the WebView; tests drive the list instead.
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const WebView = () => <View testID="webview" />;
  return { WebView, default: WebView };
});

// Most screen tests start past onboarding; consent.test.tsx unmocks this to test the gate.
jest.mock('@/components/ConsentGate', () => ({
  ConsentGate: ({ children }: { children: React.ReactNode }) => children,
}));

// Native location module has no Jest registry; screens start with permission not yet asked.
jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false, status: 'denied' })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error('no fix in tests');
  }),
}));
