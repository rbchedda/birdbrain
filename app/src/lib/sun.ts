import type { Ymd } from './time';

const rad = Math.PI / 180;
const J2000 = 2451545;
const unixEpochJd = 2440587.5;

/**
 * Sunrise and sunset for a calendar date and place (sunrise equation, within a
 * minute or two at PA latitudes). Returns null for polar day/night.
 */
export function sunTimes(ymd: Ymd, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  const [y, m, d] = ymd.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d) / 86400000 + unixEpochJd;
  const n = Math.ceil(jd - J2000 + 0.0008);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const decl = Math.asin(Math.sin(lambda * rad) * Math.sin(23.4397 * rad));
  const cosW =
    (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW) / rad / 360;
  const toDate = (j: number) => new Date((j - unixEpochJd) * 86400000);
  return { sunrise: toDate(transit - w), sunset: toDate(transit + w) };
}

/**
 * PGC hunting-hours zones (PGC_Hunting_Hours FeatureServer /300): seven
 * longitude bands, each adding minutes_plus to the base (easternmost) times in
 * the /400 daily lookup. Band edges are whole meridians 74–81 W (/200).
 */
const zoneBands: { westOf: number; minutesPlus: number }[] = [
  { westOf: 80, minutesPlus: 20 },
  { westOf: 79, minutesPlus: 16 },
  { westOf: 78, minutesPlus: 12 },
  { westOf: 77, minutesPlus: 8 },
  { westOf: 76, minutesPlus: 4 },
  { westOf: 75, minutesPlus: 0 },
  { westOf: -Infinity, minutesPlus: 0 },
];

export interface HoursZone {
  /** 1 (east) … 7 (west). */
  zone: number;
  minutesPlus: number;
}

export function pgcHoursZone(lng: number): HoursZone {
  const west = -lng;
  const i = zoneBands.findIndex((b) => west >= b.westOf);
  return { zone: zoneBands.length - i, minutesPlus: zoneBands[i].minutesPlus };
}

/** One row of the PGC /400 Hunting Hours Lookup (base band, Eastern wall time "HH:MM"). */
export interface HuntingHoursRow {
  date: Ymd;
  sunrise: string;
  sunset: string;
}

/** Instant for an Eastern wall-clock time on a date, DST-aware. */
export function etWallTime(ymd: Ymd, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = ymd.split('-').map(Number);
  // Try EDT (UTC-4), else EST (UTC-5).
  const edt = new Date(Date.UTC(y, mo - 1, d, h + 4, m));
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(edt));
  return hour === h ? edt : new Date(Date.UTC(y, mo - 1, d, h + 5, m));
}

/**
 * Sunrise/sunset the way PGC's hunting-hours tables state them: the ingested
 * base-band row plus the zone's minutes when a row is available, otherwise the
 * local sunrise equation (within ~3 minutes of PGC, per the data review).
 */
export function pgcSunTimes(
  ymd: Ymd,
  at: { lat: number; lng: number },
  lookup?: HuntingHoursRow | null,
): { sunrise: Date; sunset: Date; source: 'pgc' | 'computed' } | null {
  if (lookup && lookup.date === ymd) {
    const plus = pgcHoursZone(at.lng).minutesPlus * 60_000;
    return {
      sunrise: new Date(etWallTime(ymd, lookup.sunrise).getTime() + plus),
      sunset: new Date(etWallTime(ymd, lookup.sunset).getTime() + plus),
      source: 'pgc',
    };
  }
  const sun = sunTimes(ymd, at.lat, at.lng);
  return sun && { ...sun, source: 'computed' };
}
