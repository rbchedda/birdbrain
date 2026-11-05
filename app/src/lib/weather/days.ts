import { EXPIRED_MS, FRESH_MS } from './config';
import type { ForecastPeriod } from './nws';

export type ForecastAge = 'fresh' | 'stale' | 'expired';

/** Spec 04: fresh < 6 h, stale 6–24 h, expired > 24 h. Unreadable dates count as expired. */
export function forecastAge(fetchedAt: string | null | undefined, now = Date.now()): ForecastAge {
  const t = fetchedAt ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(t)) return 'expired';
  const age = now - t;
  return age > EXPIRED_MS ? 'expired' : age >= FRESH_MS ? 'stale' : 'fresh';
}

/** "9 h ago", "35 min ago", "just now". */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'a while ago';
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`;
}

/** "5:10 AM" in the phone's zone. */
export const clockLabel = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso) : null;
  return t && Number.isFinite(t.getTime()) ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
};

export type ForecastDay = {
  /** Local date of the NWS period (YYYY-MM-DD from its startTime offset). */
  ymd: string;
  /** "Sat" */
  label: string;
  high: number | null;
  low: number | null;
  windDirection: string;
  windMph: number | null;
  windGustMph: number | null;
  /** Highest precip chance of the day's periods. */
  precip: number | null;
  shortForecast: string;
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Folds NWS day/night periods into up to 7 calendar days (spec 03 tiles). */
export function toDays(periods: ForecastPeriod[], max = 7): ForecastDay[] {
  const days: ForecastDay[] = [];
  for (const p of periods) {
    const ymd = p.startTime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    let d = days.find((x) => x.ymd === ymd);
    if (!d) {
      if (days.length >= max) break;
      const [y, m, dd] = ymd.split('-').map(Number);
      d = { ymd, label: WEEKDAY[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()], high: null, low: null, windDirection: '', windMph: null, windGustMph: null, precip: null, shortForecast: '' };
      days.push(d);
    }
    if (p.isDaytime) d.high = p.temperature;
    else d.low = p.temperature;
    // Daytime wind is what a hunter plans on; a night-only first day ("Tonight") uses its own.
    if (p.isDaytime || d.windMph === null) {
      d.windDirection = p.windDirection;
      d.windMph = p.windMph;
      d.windGustMph = p.windGustMph;
      d.shortForecast = p.shortForecast;
    }
    if (p.precip !== null) d.precip = Math.max(d.precip ?? 0, p.precip);
  }
  return days;
}
