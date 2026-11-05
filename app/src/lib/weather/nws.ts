/**
 * National Weather Service API client (api.weather.gov). Free, no key.
 * Flow: /points/{lat},{lon} -> gridpoint `forecast` (12 h day/night periods)
 * and `forecastHourly` URLs. Every request has a timeout and never throws
 * anything but a typed NwsError, so callers can degrade quietly.
 *
 * User-Agent: NWS asks for a descriptive one, so native requests send
 * NWS_USER_AGENT. Browsers treat User-Agent as a forbidden header and drop it,
 * and any other custom header would force a CORS preflight, so the web build
 * sends none and NWS sees the browser's own UA (a known, documented limit).
 */
import { Platform } from 'react-native';

export const NWS_BASE = 'https://api.weather.gov';
export const NWS_USER_AGENT = 'BirdBrain/1.0 (github.com/rbchedda/birdbrain)';
export const NWS_TIMEOUT_MS = 8000;

export type NwsErrorKind = 'outside' | 'timeout' | 'server' | 'network' | 'bad-data';
export class NwsError extends Error {
  constructor(
    public kind: NwsErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'NwsError';
  }
}

/** Short human line for a failure; never technical. */
export function nwsErrorText(e: unknown): string {
  const kind = e instanceof NwsError ? e.kind : 'network';
  if (kind === 'outside') return 'No National Weather Service forecast for this spot (outside US coverage).';
  if (kind === 'timeout') return 'The weather service is slow right now. Try again in a bit.';
  if (kind === 'server') return 'The weather service is having trouble right now.';
  if (kind === 'bad-data') return 'The weather service sent a forecast we could not read.';
  return 'No signal for the forecast right now.';
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/geo+json' };
  if (Platform.OS !== 'web') h['User-Agent'] = NWS_USER_AGENT;
  return h;
}

/** GET JSON with an AbortController timeout. Maps every failure to NwsError. */
export async function nwsGet<T = unknown>(url: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? NWS_TIMEOUT_MS);
  const onOuterAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    let res: Response;
    try {
      res = await fetch(url, { headers: headers(), signal: ctrl.signal });
    } catch {
      if (timedOut) throw new NwsError('timeout', 'NWS request timed out');
      throw new NwsError('network', 'NWS request failed');
    }
    if (res.status === 404) throw new NwsError('outside', 'Point outside NWS coverage', 404);
    if (!res.ok) throw new NwsError('server', `NWS HTTP ${res.status}`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      if (timedOut) throw new NwsError('timeout', 'NWS request timed out');
      throw new NwsError('bad-data', 'NWS sent invalid JSON');
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

export type NwsPoint = { forecast: string; forecastHourly: string; place: string | null };

/** /points is keyed to ~1 km; 2 decimals (~1.1 km) keeps the cache small and hits often. */
export const pointKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

const pointCache = new Map<string, Promise<NwsPoint>>();
/** Test hook. */
export const clearPointCache = () => pointCache.clear();

/** Resolve a lat/lon to its gridpoint forecast URLs. Cached per rounded coordinate (failures aren't cached). */
export function getPoint(lat: number, lon: number, signal?: AbortSignal): Promise<NwsPoint> {
  const key = pointKey(lat, lon);
  const hit = pointCache.get(key);
  if (hit) return hit;
  const p = nwsGet<{ properties?: Record<string, unknown> }>(`${NWS_BASE}/points/${key}`, { signal }).then((j) => {
    const pr = j?.properties ?? {};
    if (typeof pr.forecast !== 'string' || typeof pr.forecastHourly !== 'string') {
      // NWS returns 200 without forecast URLs for some marine/edge points: treat as no coverage.
      throw new NwsError('outside', 'No forecast for this point');
    }
    const rel = (pr.relativeLocation as { properties?: { city?: string; state?: string } } | undefined)?.properties;
    return { forecast: pr.forecast, forecastHourly: pr.forecastHourly, place: rel?.city ? `${rel.city}, ${rel.state ?? ''}`.replace(/, $/, '') : null };
  });
  pointCache.set(key, p);
  p.catch(() => pointCache.delete(key));
  return p;
}

export type ForecastPeriod = {
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit: string;
  /** Precip chance 0-100, null when NWS gives none. */
  precip: number | null;
  windSpeed: string;
  /** Parsed mph (max of a range), null when unknown. */
  windMph: number | null;
  windDirection: string;
  /** Degrees the wind blows FROM (meteorological), null when variable/unknown. */
  windFromDeg: number | null;
  /** Gust mph when NWS gives one (often absent on hourly/7-day periods). */
  windGustMph: number | null;
  shortForecast: string;
};

export type Forecast = { periods: ForecastPeriod[]; updated: string | null; fetchedAt: string; place: string | null };

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** "NW" -> 315. Returns null for "", "VRB", "Variable" or anything unknown. */
export function windDirToDeg(dir: unknown): number | null {
  if (typeof dir !== 'string') return null;
  const i = COMPASS.indexOf(dir.trim().toUpperCase());
  return i < 0 ? null : i * 22.5;
}

/** "10 mph" -> 10, "8 to 13 mph" -> 13, "Calm"/"0 mph" -> 0. km/h is converted. Null if unreadable. */
export function parseWindMph(speed: unknown): number | null {
  if (typeof speed !== 'string') return null;
  if (/calm/i.test(speed)) return 0;
  const nums = (speed.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return null;
  const max = Math.max(...nums);
  return /km/i.test(speed) ? Math.round(max / 1.609) : max;
}

/** windGust is a string ("20 mph") on some endpoints and a {value, unitCode} km/h quantity on others. */
export function parseGust(g: unknown): number | null {
  if (typeof g === 'string') return parseWindMph(g);
  const v = (g as { value?: unknown; unitCode?: unknown } | null)?.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const unit = String((g as { unitCode?: unknown }).unitCode ?? '');
  return Math.round(/km_h/.test(unit) ? v / 1.609 : v);
}

export function parsePeriods(json: unknown): ForecastPeriod[] {
  const raw = (json as { properties?: { periods?: unknown } })?.properties?.periods;
  if (!Array.isArray(raw)) throw new NwsError('bad-data', 'No forecast periods');
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => {
      const pop = (p.probabilityOfPrecipitation as { value?: unknown } | undefined)?.value;
      return {
        name: typeof p.name === 'string' ? p.name : '',
        startTime: typeof p.startTime === 'string' ? p.startTime : '',
        isDaytime: p.isDaytime !== false,
        temperature: typeof p.temperature === 'number' ? p.temperature : null,
        temperatureUnit: typeof p.temperatureUnit === 'string' ? p.temperatureUnit : 'F',
        precip: typeof pop === 'number' ? pop : null,
        windSpeed: typeof p.windSpeed === 'string' ? p.windSpeed : '',
        windMph: parseWindMph(p.windSpeed),
        windDirection: typeof p.windDirection === 'string' ? p.windDirection : '',
        windFromDeg: windDirToDeg(p.windDirection),
        windGustMph: parseGust(p.windGust),
        shortForecast: typeof p.shortForecast === 'string' ? p.shortForecast : '',
      };
    });
}

/** NWS refreshes gridpoints about hourly; panning back and forth shouldn't refetch. */
export const FORECAST_TTL_MS = 10 * 60 * 1000;
const forecastCache = new Map<string, { at: number; value: Forecast }>();
/** Test hook. */
export const clearForecastCache = () => forecastCache.clear();

async function getForecastAt(kind: 'forecast' | 'forecastHourly', lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const point = await getPoint(lat, lon, signal);
  const url = point[kind];
  const hit = forecastCache.get(url);
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.value;
  const json = await nwsGet<{ properties?: { updateTime?: string } }>(url, { signal });
  const periods = parsePeriods(json);
  const value = { periods, updated: json?.properties?.updateTime ?? null, fetchedAt: new Date().toISOString(), place: point.place };
  forecastCache.set(url, { at: Date.now(), value });
  if (forecastCache.size > 64) forecastCache.delete(forecastCache.keys().next().value as string);
  return value;
}

/** 7-day forecast: 14 day/night periods. */
export const getForecast = (lat: number, lon: number, signal?: AbortSignal) => getForecastAt('forecast', lat, lon, signal);
/** Hourly forecast; periods[0] is the current hour. */
export const getHourly = (lat: number, lon: number, signal?: AbortSignal) => getForecastAt('forecastHourly', lat, lon, signal);

/** Arrow cardinal for a from-direction, e.g. "from NW". */
export function windLine(p: Pick<ForecastPeriod, 'windDirection' | 'windSpeed'>) {
  if (!p.windSpeed) return 'Wind n/a';
  return `${p.windDirection ? `${p.windDirection} ` : ''}${p.windSpeed}`;
}
