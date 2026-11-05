import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { SpotForecast } from '@/components/weather/SpotForecast';
import { clearForecastCache, clearPointCache } from '@/lib/weather/nws';
import { useWindOverlay, WIND_CONCURRENCY, type Viewport } from '@/lib/weather/useWeather';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const period = (name: string, isDaytime: boolean, temperature: number) => ({
  name,
  startTime: `2026-11-05T${isDaytime ? '06' : '18'}:00:00-05:00#${name}`,
  isDaytime,
  temperature,
  temperatureUnit: 'F',
  probabilityOfPrecipitation: { value: 40 },
  windSpeed: '5 to 10 mph',
  windDirection: 'SW',
  shortForecast: 'Partly Cloudy',
});
const FORECAST = { properties: { periods: [period('Today', true, 61), period('Tonight', false, 44)] } };
const pointsThen = (body: unknown) => async (url: string) =>
  /\/points\/[^/]+$/.test(url) ? ok({ properties: { forecast: `${url}/f`, forecastHourly: `${url}/h` } }) : ok(body);

let fetchMock: jest.Mock;
beforeEach(async () => {
  clearPointCache();
  clearForecastCache();
  await AsyncStorage.clear();
  fetchMock = jest.fn(pointsThen(FORECAST));
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('SpotForecast', () => {
  const center = { lat: 40.2, lng: -75.75 };

  it('shows day/night periods with temperature, wind and precip, and caches them', async () => {
    await render(<SpotForecast spotId="fc" center={center} />);
    await waitFor(() => expect(screen.getAllByTestId('forecast-period')).toHaveLength(2));
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('61°')).toBeTruthy();
    expect(screen.getByText('Tonight')).toBeTruthy();
    expect(screen.getAllByText('SW 5 to 10 mph')).toHaveLength(2);
    expect(screen.getAllByText('40% precip')).toHaveLength(2);
    expect(screen.getByTestId('forecast-as-of')).toHaveTextContent(/^As of .* · National Weather Service$/);
    expect(await AsyncStorage.getItem('birdbrain.forecast.v1.fc')).toContain('Tonight');
  });

  it('falls back to the cached forecast with its as-of time when offline', async () => {
    await AsyncStorage.setItem(
      'birdbrain.forecast.v1.fc',
      JSON.stringify({ periods: [{ ...period('Saturday', true, 50), windMph: 10, windFromDeg: 225, precip: 40 }], updated: null, fetchedAt: '2026-11-03T13:00:00Z', place: null }),
    );
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await render(<SpotForecast spotId="fc" center={center} />);
    await waitFor(() => expect(screen.getByTestId('forecast-error')).toHaveTextContent(/Couldn't refresh. No signal/));
    expect(screen.getByText('Saturday')).toBeTruthy();
    expect(screen.getByTestId('forecast-as-of')).toHaveTextContent(/^As of Tue, Nov 3, .* · saved on this phone · National Weather Service$/);
  });

  it('says so cleanly outside NWS coverage (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await render(<SpotForecast spotId="far" center={{ lat: 51.5, lng: -0.1 }} />);
    await waitFor(() => expect(screen.getByTestId('forecast-error')).toHaveTextContent(/outside US coverage/));
    expect(screen.queryByTestId('forecast-period')).toBeNull();
  });
});

describe('useWindOverlay', () => {
  const vp = (w: number): Viewport => ({ bounds: [[w, 40], [w + 1, 41]], zoom: 8, center: { lng: w + 0.5, lat: 40.5 } });

  it('debounces rapid pans into one run and caps concurrent requests', async () => {
    jest.useFakeTimers();
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return pointsThen({ properties: { periods: [period('Now', true, 50)] } })(url);
    });
    const { result, rerender } = await renderHook((p: { v: Viewport }) => useWindOverlay(true, p.v), { initialProps: { v: vp(-80) } });
    await rerender({ v: vp(-79) });
    await rerender({ v: vp(-78) });
    await act(async () => {
      jest.advanceTimersByTime(799);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();
    await waitFor(() => expect(result.current.samples).toHaveLength(9));
    const pointUrls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => /\/points\/[^/]+$/.test(u));
    // Only the last viewport (-78..-77) was sampled; plus the center point.
    expect(pointUrls.every((u) => /points\/40\.\d+,-77\.\d+$/.test(u))).toBe(true);
    // 3 grid workers + the center request.
    expect(peak).toBeLessThanOrEqual(WIND_CONCURRENCY + 1);
    expect(result.current.now).toMatchObject({ temperature: 50, precip: 40 });
  });

  it('does nothing while disabled', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useWindOverlay(false, vp(-77)));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    jest.useRealTimers();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.samples).toBeNull();
  });
});
