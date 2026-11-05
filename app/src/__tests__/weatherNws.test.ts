import {
  clearForecastCache,
  clearPointCache,
  getForecast,
  getHourly,
  getPoint,
  NWS_USER_AGENT,
  NwsError,
  nwsErrorText,
  nwsGet,
  parsePeriods,
  parseWindMph,
  pointKey,
  windDirToDeg,
} from '@/lib/weather/nws';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const status = (s: number) => ({ ok: false, status: s, json: async () => ({ status: s }) }) as unknown as Response;
const POINT = {
  properties: {
    forecast: 'https://api.weather.gov/gridpoints/PHI/28,87/forecast',
    forecastHourly: 'https://api.weather.gov/gridpoints/PHI/28,87/forecast/hourly',
    relativeLocation: { properties: { city: 'Douglassville', state: 'PA' } },
  },
};
const PERIOD = {
  name: 'Today',
  startTime: '2026-11-05T11:00:00-05:00',
  isDaytime: true,
  temperature: 71,
  temperatureUnit: 'F',
  probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 30 },
  windSpeed: '8 to 13 mph',
  windDirection: 'S',
  shortForecast: 'Chance Light Rain',
};
const FORECAST = { properties: { updateTime: '2026-11-05T09:07:43+00:00', periods: [PERIOD, { ...PERIOD, name: 'Tonight', isDaytime: false, temperature: 48, probabilityOfPrecipitation: { value: null }, windSpeed: 'Calm', windDirection: '' }] } };

let fetchMock: jest.Mock;
beforeEach(() => {
  clearPointCache();
  clearForecastCache();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

describe('wind parsing', () => {
  it('maps compass points to degrees the wind comes from', () => {
    expect(windDirToDeg('N')).toBe(0);
    expect(windDirToDeg('S')).toBe(180);
    expect(windDirToDeg('NW')).toBe(315);
    expect(windDirToDeg('wsw')).toBe(247.5);
    expect(windDirToDeg('')).toBeNull();
    expect(windDirToDeg('VRB')).toBeNull();
    expect(windDirToDeg(undefined)).toBeNull();
  });
  it('reads speeds, ranges, calm and km/h', () => {
    expect(parseWindMph('10 mph')).toBe(10);
    expect(parseWindMph('8 to 13 mph')).toBe(13);
    expect(parseWindMph('Calm')).toBe(0);
    expect(parseWindMph('16 km/h')).toBe(10);
    expect(parseWindMph('')).toBeNull();
    expect(parseWindMph(null)).toBeNull();
  });
});

describe('/points to forecast', () => {
  it('follows the forecast URL from /points and parses periods', async () => {
    fetchMock.mockResolvedValueOnce(ok(POINT)).mockResolvedValueOnce(ok(FORECAST));
    const f = await getForecast(40.2012, -75.7488);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.weather.gov/points/40.20,-75.75');
    expect(fetchMock.mock.calls[1][0]).toBe(POINT.properties.forecast);
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toBe(NWS_USER_AGENT);
    expect(f.place).toBe('Douglassville, PA');
    expect(f.updated).toBe('2026-11-05T09:07:43+00:00');
    expect(f.periods[0]).toMatchObject({ name: 'Today', temperature: 71, precip: 30, windMph: 13, windFromDeg: 180, isDaytime: true });
    expect(f.periods[1]).toMatchObject({ name: 'Tonight', isDaytime: false, precip: null, windMph: 0, windFromDeg: null });
  });
  it('caches /points per rounded coordinate and hourly per gridpoint', async () => {
    fetchMock.mockResolvedValueOnce(ok(POINT)).mockResolvedValue(ok(FORECAST));
    await getHourly(40.201, -75.749);
    await getHourly(40.199, -75.751); // same 0.01° cell
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://api.weather.gov/points/40.20,-75.75', POINT.properties.forecastHourly]);
    expect(pointKey(40.199, -75.751)).toBe('40.20,-75.75');
  });
  it('rejects malformed periods as bad data', () => {
    expect(() => parsePeriods({ properties: {} })).toThrow(NwsError);
  });
});

describe('failures', () => {
  it('maps the outside-coverage 404 to "outside" and does not cache it', async () => {
    fetchMock.mockResolvedValue(status(404));
    await expect(getPoint(51.5, -0.1)).rejects.toMatchObject({ kind: 'outside', status: 404 });
    await expect(getPoint(51.5, -0.1)).rejects.toMatchObject({ kind: 'outside' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(nwsErrorText(new NwsError('outside', 'x'))).toMatch(/outside US coverage/);
  });
  it('maps 5xx to "server"', async () => {
    fetchMock.mockResolvedValue(status(503));
    await expect(nwsGet('https://api.weather.gov/x')).rejects.toMatchObject({ kind: 'server', status: 503 });
  });
  it('maps a thrown fetch to "network"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(nwsGet('https://api.weather.gov/x')).rejects.toMatchObject({ kind: 'network' });
  });
  it('aborts after the timeout', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('AbortError')))),
    );
    const p = nwsGet('https://api.weather.gov/x', { timeoutMs: 8000 });
    jest.advanceTimersByTime(8000);
    await expect(p).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('treats a 200 /points with no forecast URL as outside coverage', async () => {
    fetchMock.mockResolvedValue(ok({ properties: {} }));
    await expect(getPoint(40, -75)).rejects.toMatchObject({ kind: 'outside' });
  });
});
