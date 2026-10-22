import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { LOCATION_DENIED_MESSAGE } from '@/lib/location';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

describe('Map screen: center on me', () => {
  it('denied permission shows a message with Settings, no crash', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.press(await screen.findByLabelText('Center map on my location'));
    expect(await screen.findByText(LOCATION_DENIED_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Open Settings')).toBeTruthy();
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByText(LOCATION_DENIED_MESSAGE)).toBeNull();
  });
});
