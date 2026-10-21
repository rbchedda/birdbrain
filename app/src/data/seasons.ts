import { pgcSunTimes, type HuntingHoursRow } from '@/lib/sun';
import { formatDay, formatTime, midnightET, todayET, weekdayOf, type Ymd } from '@/lib/time';

import { allSpecies, migratory, type Place, type Species } from './types';

/**
 * 2026-27 Pennsylvania season calendar, statewide dates only. Compiled from
 * PGC's approved 2026-27 seasons as reported in October 2026. Turkey dates vary
 * by WMU and waterfowl by zone. Always defer to the PGC Hunting & Trapping
 * Digest; the app says so wherever it shows these.
 */
export const SEASON_YEAR = '2026-27';

/**
 * Hours rules from the 2026-27 digest (Hunting Hours Table, p. 12; Migratory
 * Game Bird Hunting Hours, p. 44):
 * - smallGame: ½ hour before sunrise to ½ hour after sunset (pheasant, grouse, fall turkey).
 * - migratory: ½ hour before sunrise to sunset (doves, waterfowl).
 * - springTurkey: ½ hour before sunrise to noon through SPRING_NOON_UNTIL, then to ½ hour after sunset.
 */
export type Hours = 'smallGame' | 'migratory' | 'springTurkey';

/**
 * Last day of noon-only spring gobbler hours. The digest says May 15; PGC's
 * Apr 11, 2026 release says May 16. Using the digest until PGC confirms.
 */
export const SPRING_NOON_UNTIL: Ymd = '2027-05-15';

export interface Season {
  species: Species;
  label: string;
  /** Inclusive [start, end] windows. Null means dates vary (zone/WMU): check the digest. */
  windows: [Ymd, Ymd][] | null;
  hours: Hours;
  /** Junior / mentored youth only. */
  youth?: boolean;
  note?: string;
}

export const seasons: Season[] = [
  {
    species: 'pheasant',
    label: 'Junior pheasant',
    windows: [['2026-10-10', '2026-10-17']],
    hours: 'smallGame',
    youth: true,
    note: 'Junior license holders and mentored youth only.',
  },
  {
    species: 'pheasant',
    label: 'Ring-necked pheasant',
    windows: [
      ['2026-10-24', '2026-12-24'],
      ['2026-12-26', '2027-02-28'],
    ],
    hours: 'smallGame',
    note: 'Daily limit 2. Pheasant permit required.',
  },
  {
    species: 'grouse',
    label: 'Ruffed grouse',
    windows: [
      ['2026-10-17', '2026-12-24'],
      ['2026-12-26', '2027-01-23'],
    ],
    hours: 'smallGame',
    note: 'Daily limit 2.',
  },
  {
    species: 'dove',
    label: 'Mourning dove',
    windows: [
      ['2026-09-01', '2026-11-27'],
      ['2026-12-18', '2027-01-02'],
    ],
    hours: 'migratory',
    note: 'Daily limit 15. Migratory bird license required.',
  },
  {
    species: 'turkey',
    label: 'Fall turkey',
    windows: [
      ['2026-10-31', '2026-11-14'],
      ['2026-11-26', '2026-11-28'],
    ],
    hours: 'smallGame',
    note: 'Most WMUs; several are closed or shorter. Check your WMU.',
  },
  {
    species: 'turkey',
    label: 'Spring gobbler',
    windows: [['2027-05-01', '2027-05-31']],
    hours: 'springTurkey',
    note: 'Hours extend past noon later in the season; check the digest.',
  },
  {
    species: 'waterfowl',
    label: 'Ducks and geese',
    windows: null,
    hours: 'migratory',
    note: 'Dates vary by zone. Federal duck stamp and migratory bird license required.',
  },
];

/** PA allows Sundays in nearly every 2026-27 season; migratory birds are the exception. */
export const sundayClosed = (species: Species) => migratory.includes(species);

export type SpeciesStatus =
  | { kind: 'open'; season: Season; start: Date; end: Date }
  | { kind: 'sunday'; season: Season }
  | { kind: 'closed'; nextOpen: { season: Season; date: Ymd } | null }
  | { kind: 'check'; season: Season };

const inWindow = (ymd: Ymd, [a, b]: [Ymd, Ymd]) => ymd >= a && ymd <= b;

const HALF_HOUR = 30 * 60_000;

export function legalHours(hours: Hours, ymd: Ymd, at: { lat: number; lng: number }, lookup?: HuntingHoursRow | null) {
  const sun = pgcSunTimes(ymd, at, lookup);
  if (!sun) return null;
  const start = new Date(sun.sunrise.getTime() - HALF_HOUR);
  const afterSunset = new Date(sun.sunset.getTime() + HALF_HOUR);
  if (hours === 'migratory') return { start, end: sun.sunset, source: sun.source };
  if (hours === 'springTurkey' && ymd <= SPRING_NOON_UNTIL) {
    return { start, end: new Date(midnightET(ymd).getTime() + 12 * 3600_000), source: sun.source };
  }
  return { start, end: afterSunset, source: sun.source };
}

/** Open/closed status for one species on a given ET date at a location. */
export function speciesStatus(
  species: Species,
  ymd: Ymd,
  at: { lat: number; lng: number },
  lookup?: HuntingHoursRow | null,
): SpeciesStatus {
  const relevant = seasons.filter((s) => s.species === species);
  const isSunday = weekdayOf(ymd) === 0;
  // Prefer the general season over the youth season when both apply.
  const open = relevant
    .filter((s) => s.windows?.some((w) => inWindow(ymd, w)))
    .sort((a, b) => Number(!!a.youth) - Number(!!b.youth))[0];
  if (open) {
    if (isSunday && sundayClosed(species)) return { kind: 'sunday', season: open };
    const hours = legalHours(open.hours, ymd, at, lookup);
    if (hours) return { kind: 'open', season: open, start: hours.start, end: hours.end };
  }
  const unknown = relevant.find((s) => s.windows === null);
  if (unknown) return { kind: 'check', season: unknown };

  let nextOpen: { season: Season; date: Ymd } | null = null;
  for (const s of relevant) {
    for (const [start] of s.windows ?? []) {
      if (start > ymd && (!nextOpen || start < nextOpen.date)) nextOpen = { season: s, date: start };
    }
  }
  return { kind: 'closed', nextOpen };
}

/** Species a place is managed for. Game lands carry none in the data and allow all. */
export const placeSpecies = (place: Place): Species[] => (place.species.length ? place.species : allSpecies);

export interface PlaceToday {
  date: Ymd;
  open: boolean;
  statuses: { species: Species; status: SpeciesStatus }[];
}

export function placeToday(place: Place, now = new Date()): PlaceToday {
  const date = todayET(now);
  const statuses = placeSpecies(place).map((species) => ({
    species,
    status: speciesStatus(species, date, place.center),
  }));
  return { date, open: statuses.some((s) => s.status.kind === 'open' && !s.status.season.youth), statuses };
}

export function describeStatus(status: SpeciesStatus, now = new Date()): string {
  switch (status.kind) {
    case 'open': {
      const range = `${formatTime(status.start)} – ${formatTime(status.end)}`;
      const youth = status.season.youth ? 'Youth only · ' : '';
      if (now > status.end) return `${youth}Open today; legal hours ended ${formatTime(status.end)}`;
      return `${youth}Open today · ${range}`;
    }
    case 'sunday':
      return 'Closed Sundays (migratory birds)';
    case 'check':
      return status.season.note ?? 'Check the PGC digest';
    case 'closed':
      if (!status.nextOpen) return 'Out of season';
      return `Closed · opens ${formatDay(status.nextOpen.date)}${status.nextOpen.season.youth ? ' (youth)' : ''}`;
  }
}

/** Upcoming or current windows for the Learn screen. */
export function seasonWindows(season: Season, from: Ymd) {
  return (season.windows ?? []).map(([a, b]) => ({
    label: `${formatDay(a)} – ${formatDay(b)}`,
    current: inWindow(from, [a, b]),
    past: b < from,
  }));
}
