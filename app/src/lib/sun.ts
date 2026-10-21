import huntingHours from '@/data/huntingHours.json';

import type { Ymd } from './time';

/**
 * Official PGC hunting-hours data, bundled from the PGC_Hunting_Hours ArcGIS
 * service by scripts/fetch-hunting-hours.mjs (source URL and fetch date are in
 * the JSON). No computed sunrise/sunset: when a date or zone isn't in the
 * table, callers get null and must show "check the digest".
 */
export interface HoursZone {
  /** 1 (east) … 7 (west). */
  zone: number;
  minutesPlus: number;
  meridianEast: number;
  meridianWest: number;
}

export interface HoursTable {
  version: string;
  source: string;
  fetchedAt: string;
  zones: { meridianEast: number; meridianWest: number; minutesPlus: number }[];
  /** ymd -> [sunrise, sunset, hunt_start, hunt_end], base band, Eastern "HH:MM". */
  rows: Record<string, string[]>;
}

export const officialHours: HoursTable = {
  version: `pgc-hours@${huntingHours.lastEditDate.slice(0, 10)}`,
  source: huntingHours.source,
  fetchedAt: huntingHours.fetchedAt,
  zones: huntingHours.zones,
  rows: huntingHours.rows as Record<string, string[]>,
};

/** The PGC hours zone (/300) containing a longitude, or null outside the table's bands. */
export function pgcHoursZone(lng: number, table: HoursTable = officialHours): HoursZone | null {
  const west = -lng;
  const i = table.zones.findIndex((z) => west >= z.meridianEast && west < z.meridianWest);
  return i < 0 ? null : { zone: i + 1, ...table.zones[i] };
}

/** Instant for an Eastern wall-clock time on a date, DST-aware. */
export function etWallTime(ymd: Ymd, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = ymd.split('-').map(Number);
  const edt = new Date(Date.UTC(y, mo - 1, d, h + 4, m));
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(edt));
  return hour === h ? edt : new Date(Date.UTC(y, mo - 1, d, h + 5, m));
}

export interface OfficialDay {
  sunrise: Date;
  sunset: Date;
  huntStart: Date;
  huntEnd: Date;
  zone: HoursZone;
}

/** PGC table row for a date, shifted by the zone's minutes_plus. Null if the date or zone is missing. */
export function officialDay(ymd: Ymd, lng: number, table: HoursTable = officialHours): OfficialDay | null {
  const row = table.rows[ymd];
  const zone = pgcHoursZone(lng, table);
  if (!row || !zone) return null;
  const at = (hhmm: string) => new Date(etWallTime(ymd, hhmm).getTime() + zone.minutesPlus * 60_000);
  const [sunrise, sunset, huntStart, huntEnd] = row.map(at);
  return { sunrise, sunset, huntStart, huntEnd, zone };
}
