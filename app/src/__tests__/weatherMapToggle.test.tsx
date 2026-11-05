import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { PlaceMapProps } from '@/components/map/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearForecastCache, clearPointCache } from '@/lib/weather/nws';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
// Capture the map's props so the test can play the page's viewport messages.
const mapProps: { current?: PlaceMapProps } = {};
jest.mock('@/components/map/PlaceMap', () => {
  const { View } = require('react-native');
  return {
    PlaceMap: (p: PlaceMapProps) => {
      mapProps.current = p;
      return <View testID="place-map" />;
    },
  };
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const H = 3600_000;
const t0 = Math.floor(Date.now() / H) * H;
const hourly = {
  properties: {
    updateTime: new Date(t0).toISOString(),
    periods: Array.from({ length: 50 }, (_, i) => ({ name: '', startTime: new Date(t0 + i * H).toISOString(), isDaytime: true, temperature: 58, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 20 }, windSpeed: `${12 + i} mph`, windDirection: 'NW', windGust: '18 mph', shortForecast: 'Sunny' })),
  },
};

let fetchMock: jest.Mock;
beforeEach(async () => {
  await AsyncStorage.clear();
  clearPointCache();
  clearForecastCache();
  fetchMock = jest.fn(async (url: string) =>
    /\/points\/[^/]+$/.test(url)
      ? ok({ properties: { forecast: `${url}/f`, forecastHourly: `${url}/h`, relativeLocation: { properties: { city: 'Elverson', state: 'PA' } } } })
      : url.startsWith('https://api.weather.gov')
        ? ok(hourly)
        : ok({}),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});
const nwsCalls = () => fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith('https://api.weather.gov'));

const VP = { bounds: [[-76, 40], [-75, 41]] as [[number, number], [number, number]], zoom: 8, center: { lng: -75.5, lat: 40.5 } };
const openLayers = async () => fireEvent.press(await screen.findByTestId('layers-button'));

describe('wind layer switch (Layers menu, spec 01/02)', () => {
  it('is off by default and never calls NWS until turned on', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await openLayers();
    expect(screen.getByText('Overlays')).toBeTruthy();
    expect(screen.getByText('NWS forecast · arrows')).toBeTruthy();
    expect(screen.getByTestId('wind-switch')).toHaveProp('value', false);
    expect(screen.queryByTestId('wind-button')).toBeNull();
    await act(async () => mapProps.current?.onViewportChange?.(VP));
    expect(nwsCalls()).toEqual([]);
    expect(screen.queryByTestId('wind-readout')).toBeNull();
    expect(mapProps.current?.wind ?? null).toBeNull();
  });

  it('draws arrows and the readout with the hour stepper when on, remembers it, and clears when off', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await openLayers();
    await fireEvent(screen.getByTestId('wind-switch'), 'valueChange', true);
    expect(await AsyncStorage.getItem('birdbrain.wind.v1')).toBe('true');
    await act(async () => mapProps.current?.onViewportChange?.(VP));
    await waitFor(() => expect(screen.getByTestId('wind-readout-speed')).toHaveTextContent('NW 12 mph'), { timeout: 4000 });
    expect(screen.getByTestId('wind-readout-detail')).toHaveTextContent(/^gusts 18 · .* · NWS forecast, updated .*$/);
    expect(mapProps.current?.wind).toHaveLength(25);
    expect(mapProps.current?.wind?.[0]).toMatchObject({ fromDeg: 315, mph: 12 });
    expect(mapProps.current?.windOpacity).toBe(0.85);
    expect(screen.getByTestId('wind-hour-prev')).toHaveProp('accessibilityState', { disabled: true });
    await fireEvent.press(screen.getByTestId('wind-hour-next'));
    expect(screen.getByTestId('wind-readout-speed')).toHaveTextContent('NW 13 mph');
    expect(mapProps.current?.wind?.[0]).toMatchObject({ mph: 13 });
    await fireEvent(screen.getByTestId('wind-switch'), 'valueChange', false);
    expect(screen.queryByTestId('wind-readout')).toBeNull();
    expect(mapProps.current?.wind).toBeNull();
    expect(await AsyncStorage.getItem('birdbrain.wind.v1')).toBe('false');
  });

  it('shows a calm message and keeps the map when NWS is down', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('https://api.weather.gov') ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response) : ok({}),
    );
    await renderRouter('./src/app', { initialUrl: '/' });
    await openLayers();
    await fireEvent(screen.getByTestId('wind-switch'), 'valueChange', true);
    await act(async () => mapProps.current?.onViewportChange?.(VP));
    await waitFor(() => expect(screen.getByTestId('wind-readout-error')).toHaveTextContent(/having trouble/), { timeout: 4000 });
    expect(screen.getByTestId('place-map')).toBeTruthy();
  });
});
