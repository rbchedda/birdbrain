import { describeStatus, legalHours, seasons, speciesStatus, type SpeciesStatus } from '@/data/seasons';
import { officialHours, type HoursTable } from '@/lib/sun';
import { addDays, formatTime, weekdayOf, type Ymd } from '@/lib/time';

import { allSpecies, speciesLabel, type Species } from './types';

/**
 * Guide tab helpers. Status and hours reuse the Open Today logic
 * (speciesStatus / describeStatus / legalHours in seasons.ts); nothing here
 * computes sun times.
 */

export type GuideSection = 'season' | 'regs' | 'birds' | 'gear' | 'bag' | 'hours';
export const GUIDE_SECTIONS: { key: GuideSection; label: string }[] = [
  { key: 'season', label: 'In season' },
  { key: 'regs', label: 'Regs' },
  { key: 'birds', label: 'Bird ID' },
  { key: 'gear', label: 'Gear' },
  { key: 'bag', label: 'Bag' },
  { key: 'hours', label: 'Hours' },
];

/** A season opening within this many days shows SOON instead of CLOSED. */
export const SOON_DAYS = 14;

/** PGC hours zones (1 = east … 7 = west) and a longitude inside each band, used to look up the table. */
export function hoursZones(table: HoursTable = officialHours) {
  return table.zones.map((z, i) => ({ zone: i + 1, minutesPlus: z.minutesPlus, lng: -(z.meridianEast + z.meridianWest) / 2 }));
}

export const zoneLng = (zone: number, table: HoursTable = officialHours) =>
  hoursZones(table).find((z) => z.zone === zone)?.lng ?? null;

export type Badge = 'OPEN' | 'SOON' | 'CLOSED' | 'CHECK';

export interface InSeasonRow {
  species: Species;
  label: string;
  badge: Badge;
  detail: string;
  status: SpeciesStatus;
}

const daysBetween = (a: Ymd, b: Ymd) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export function badgeFor(status: SpeciesStatus, ymd: Ymd): Badge {
  switch (status.kind) {
    case 'open':
      return 'OPEN';
    case 'check':
      return 'CHECK';
    case 'sunday':
      return 'CLOSED';
    case 'closed':
      return status.nextOpen && daysBetween(ymd, status.nextOpen.date) <= SOON_DAYS ? 'SOON' : 'CLOSED';
  }
}

/** In season now, for a zone: one row per species, from speciesStatus (same as the Open Today card). */
export function inSeasonRows(ymd: Ymd, zone: number, now = new Date(), table: HoursTable = officialHours): InSeasonRow[] {
  const lng = zoneLng(zone, table) ?? -76.88;
  return allSpecies.map((species) => {
    const status = speciesStatus(species, ymd, { lat: 40.5, lng }, table);
    return { species, label: speciesLabel[species], badge: badgeFor(status, ymd), detail: describeStatus(status, now), status };
  });
}

export interface HoursRow {
  ymd: Ymd;
  sunday: boolean;
  /** Pheasant, grouse, fall turkey: hunt_start – hunt_end. Null when the table has no row. */
  smallGame: { start: string; end: string } | null;
  /** Doves, woodcock, waterfowl (also snipe, rails, gallinules): hunt_start – sunset. */
  migratory: { start: string; end: string } | null;
}

/** Shooting times for `days` days from `ymd` in a zone, straight from the bundled PGC table. */
export function shootingTimes(ymd: Ymd, zone: number, days = 8, table: HoursTable = officialHours): HoursRow[] {
  const lng = zoneLng(zone, table);
  const fmt = (h: { start: Date; end: Date } | null) => (h ? { start: formatTime(h.start), end: formatTime(h.end) } : null);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(ymd, i);
    return {
      ymd: d,
      sunday: weekdayOf(d) === 0,
      smallGame: lng === null ? null : fmt(legalHours('smallGame', d, lng, table)),
      migratory: lng === null ? null : fmt(legalHours('migratory', d, lng, table)),
    };
  });
}

/** Seasons listed for a species, for the bag section's segment labels. */
export const segmentsFor = (species: Species) => seasons.filter((s) => s.species === species);

/** Spring gobbler hours (digest p.10 note 3, p.35). A rule, not a computed time. */
export const SPRING_GOBBLER_HOURS =
  'Spring gobbler: ½ hour before sunrise to noon through May 15, then ½ hour before sunrise to ½ hour after sunset.';
