import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { SpotForecast } from '@/components/weather/SpotForecast';
import { resetSignal } from '@/lib/connectivity';
import { WIND_DEFAULT_ON } from '@/lib/weather/config';
import { forecastAge, toDays } from '@/lib/weather/days';
import { clearForecastCache, clearPointCache, parsePeriods } from '@/lib/weather/nws';
import { useWindOverlay, type Viewport } from '@/lib/weather/useWeather';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const H = 3600_000;
const iso = (t: number) => new Date(t).toISOString();
const period = (name: string, startTime: string, isDaytime: boolean, temperature: number, extra: object = {}) => ({
  name,
  startTime,
  isDaytime,
  temperature,
  temperatureUnit: 'F',
  probabilityOfPrecipitation: { value: 40 },
  windSpeed: '5 to 10 mph',
  windDirection: 'SW',
  shortForecast: 'Partly Cloudy',
  ...extra,
});
// Seven days, day + night each, from Sat Nov 14 2026 (inside the PGC hours table).
const SEVEN = Array.from({ length: 7 }, (_, i) => {
  const d = `2026-11-${String(14 + i).padStart(2, '0')}`;
  return [period(`D${i}`, `${d}T06:00:00-05:00`, true, 48 - i, { precipitation: 0 }), period(`N${i}`, `${d}T18:00:00-05:00`, false, 31 - i)];
}).flat();
const FORECAST = { properties: { updateTime: '2026-11-14T10:10:00Z', periods: SEVEN } };
const pointsThen = (body: unknown) => async (url: string) =>
  /\/points\/[^/]+$/.test(url) ? ok({ properties: { forecast: `${url}/f`, forecastHourly: `${url}/h` } }) : ok(body);

let fetchMock: jest.Mock;
beforeEach(async () => {
  clearPointCache();
  clearForecastCache();
  resetSignal();
  await AsyncStorage.clear();
  fetchMock = jest.fn(pointsThen(FORECAST));
  global.fetch = fetchMock as unknown as typeof fetch;
});

const cachedAt = async (ageMs: number) =>
  AsyncStorage.setItem(
    'birdbrain.forecast.v1.fc',
    JSON.stringify({ periods: parsePeriods(FORECAST), updated: null, fetchedAt: iso(Date.now() - ageMs), place: null }),
  );

describe('forecast days and age', () => {
  it('wind layer default is off until RBChedda decides (one constant)', () => {
    expect(WIND_DEFAULT_ON).toBe(false);
  });

  it('folds day/night periods into 7 tiles with high/low and max precip', () => {
    const days = toDays(parsePeriods(FORECAST));
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ ymd: '2026-11-14', label: 'Sat', high: 48, low: 31, windDirection: 'SW', windMph: 10, precip: 40 });
    expect(days[1].label).toBe('Sun');
  });

  it('starts with a night-only "Tonight" day', () => {
    const days = toDays(parsePeriods({ properties: { periods: [period('Tonight', '2026-11-13T18:00:00-05:00', false, 30), ...SEVEN] } }));
    expect(days[0]).toMatchObject({ ymd: '2026-11-13', high: null, low: 30, windMph: 10 });
    expect(days).toHaveLength(7);
  });

  it('fresh < 6 h, stale 6–24 h, expired > 24 h', () => {
    const now = Date.now();
    expect(forecastAge(iso(now - 5 * H), now)).toBe('fresh');
    expect(forecastAge(iso(now - 9 * H), now)).toBe('stale');
    expect(forecastAge(iso(now - 25 * H), now)).toBe('expired');
    expect(forecastAge(null, now)).toBe('expired');
  });
});

describe('SpotForecast (spec 03/04)', () => {
  const center = { lat: 40.2, lng: -77.9 };

  it('shows seven tiles, the day card with sun/legal hours, the source line, and caches it', async () => {
    await render(<SpotForecast spotId="fc" center={center} />);
    await waitFor(() => expect(screen.getAllByTestId('forecast-day')).toHaveLength(7));
    expect(screen.getByText('Sat')).toBeTruthy();
    expect(screen.getAllByText('SW 10')).toHaveLength(7);
    expect(screen.getByText('48°/31°')).toBeTruthy();
    expect(screen.getByTestId('forecast-day-card')).toHaveTextContent(/Sat, Nov 14.*Sunrise .* · Sunset .*Legal hours .* \(PGC\) · AM: SW 10 mph · Rain 40%/);
    await fireEvent.press(screen.getByText('Mon'));
    expect(screen.getByTestId('forecast-day-card')).toHaveTextContent(/Mon, Nov 16/);
    expect(screen.getByTestId('forecast-source')).toHaveTextContent(/^National Weather Service · updated .* · Source ›$/);
    expect(await AsyncStorage.getItem('birdbrain.forecast.v1.fc')).toContain('2026-11-20');
  });

  it('stale (9 h, no signal): dimmed tiles and "Saved 9 h ago… will refresh"', async () => {
    await cachedAt(9 * H);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await render(<SpotForecast spotId="fc" center={center} />);
    await waitFor(() => expect(screen.getByTestId('forecast-stale')).toHaveTextContent(/Saved 9 h ago \(.*\)\. No signal\. Will refresh when you're back online\./));
    expect(screen.getAllByTestId('forecast-day')).toHaveLength(7);
  });

  it('expired (> 24 h): forecast hidden, sun and legal hours still shown', async () => {
    await cachedAt(30 * H);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await render(<SpotForecast spotId="fc" center={center} />);
    await waitFor(() => expect(screen.getByTestId('forecast-expired')).toHaveTextContent(/more than a day old, so it's hidden/));
    expect(screen.queryByTestId('forecast-day')).toBeNull();
  });

  it('NWS down with nothing saved: "Forecast unavailable right now." + Try again refetches', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await render(<SpotForecast spotId="fc" center={center} />);
    await waitFor(() => expect(screen.getByTestId('forecast-error')).toHaveTextContent('Forecast unavailable right now.'));
    fetchMock.mockImplementation(pointsThen(FORECAST));
    await fireEvent.press(screen.getByTestId('forecast-retry'));
    await waitFor(() => expect(screen.getAllByTestId('forecast-day')).toHaveLength(7));
  });

  it('shows skeleton tiles while loading', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await render(<SpotForecast spotId="fc" center={center} />);
    expect(screen.getByTestId('forecast-loading')).toBeTruthy();
    await screen.unmount();
  });

  it('says so cleanly outside NWS coverage (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await render(<SpotForecast spotId="far" center={{ lat: 51.5, lng: -0.1 }} />);
    await waitFor(() => expect(screen.getByTestId('forecast-error')).toHaveTextContent(/outside US coverage/));
    expect(screen.queryByTestId('forecast-retry')).toBeNull();
  });
});

describe('useWindOverlay (spec 02/04)', () => {
  const vp = (w: number): Viewport => ({ bounds: [[w, 40], [w + 1, 41]], zoom: 8, center: { lng: w + 0.5, lat: 40.5 } });
  const hourly = () => {
    const t0 = Math.floor(Date.now() / H) * H;
    return {
      properties: {
        updateTime: iso(t0),
        periods: Array.from({ length: 60 }, (_, i) =>
          period('', iso(t0 + i * H), true, 50, { windSpeed: `${9 + i} mph`, windDirection: i % 2 ? 'N' : 'SW', windGust: i === 0 ? '16 mph' : null }),
        ),
      },
    };
  };

  it('debounces pans, fetches only the center cell, and steps hours 0..48', async () => {
    fetchMock.mockImplementation(pointsThen(hourly()));
    jest.useFakeTimers();
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
    await waitFor(() => expect(result.current.hour).not.toBeNull());
    const pointUrls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => /\/points\/[^/]+$/.test(u));
    expect(pointUrls).toEqual(['https://api.weather.gov/points/40.50,-77.50']);
    expect(result.current.samples).toHaveLength(25);
    expect(result.current.samples?.[0]).toMatchObject({ fromDeg: 225, mph: 9 });
    expect(result.current.hour).toMatchObject({ direction: 'SW', mph: 9, gust: 16 });
    expect(result.current.opacity).toBe(0.85);
    expect(result.current.hourCount).toBe(49);
    await act(async () => result.current.setHour(1));
    expect(result.current.samples?.[0]).toMatchObject({ fromDeg: 0, mph: 10 });
    await act(async () => result.current.setHour(500));
    expect(result.current.hourIndex).toBe(48);
    expect(await AsyncStorage.getItem('birdbrain.wind.last.v1')).toBeTruthy();
  });

  it('offline: uses the saved forecast at 50% opacity', async () => {
    await AsyncStorage.setItem('birdbrain.wind.last.v1', JSON.stringify({ periods: parsePeriods(hourly()), updated: null, fetchedAt: iso(Date.now() - 9 * H), place: null }));
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await renderHook(() => useWindOverlay(true, vp(-77)));
    await waitFor(() => expect(result.current.saved).toBe(true), { timeout: 3000 });
    expect(result.current.opacity).toBe(0.5);
    expect(result.current.samples).toHaveLength(25);
  });

  it('offline with a > 24 h save: no arrows and the switch needs signal', async () => {
    await AsyncStorage.setItem('birdbrain.wind.last.v1', JSON.stringify({ periods: parsePeriods(hourly()), updated: null, fetchedAt: iso(Date.now() - 30 * H), place: null }));
    resetSignal({ online: false, back: false });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await renderHook(() => useWindOverlay(true, vp(-77)));
    await waitFor(() => expect(result.current.error).toMatch(/No signal/), { timeout: 3000 });
    expect(result.current.samples).toBeNull();
    expect(result.current.needsSignal).toBe(true);
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
