import { officialDay, officialHours, type HoursTable } from '@/lib/sun';
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
 * Hours rules from the 2026-27 digest
 * (https://www.pa.gov/content/dam/copapwp-pagov/en/pgc/documents/hunttrap/law/pa%20game%20hunttrap%20digest%2026-27.pdf;
 * page numbers are PDF pages, printed page = PDF page - 2): Hunting Hours Table, PDF p. 12
 * (printed p. 10), exception 4 covers woodcock; Migratory Game Bird Hunting Hours, PDF p. 44.
 * No special opening-day start time for pheasant appears anywhere in the 2026-27 digest.
 * - smallGame: ½ hour before sunrise to ½ hour after sunset (pheasant, grouse, fall turkey).
 * - migratory: ½ hour before sunrise to sunset (doves, waterfowl, woodcock).
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

// Pheasant dates: digest PDF p. 42 (printed p. 40, junior Oct 10-18) and PDF p. 43 (printed p. 41,
// statewide Oct 24-Dec 24 & Dec 26-Feb 28, 2027). Verified 2026-10-22; also matches pa.gov seasons page.
export const seasons: Season[] = [
  {
    species: 'pheasant',
    label: 'Junior pheasant',
    windows: [['2026-10-10', '2026-10-18']],
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
    // Digest p.35: dates vary by WMU (Oct 31-Nov 3 up to Oct 31-Nov 20, some
    // WMUs add Nov 25-27; closed in 5C/5D), so no statewide window.
    windows: null,
    hours: 'smallGame',
    note: 'Limit 1 bird per season. Dates vary by WMU (from Oct 31); closed in WMUs 5C and 5D. Check your WMU in the digest.',
  },
  {
    species: 'turkey',
    label: 'Spring gobbler',
    windows: [['2027-05-01', '2027-05-31']],
    hours: 'springTurkey',
    note: 'Limit 1 bearded bird per season. Noon close through May 15, then ½ hour after sunset.',
  },
  {
    species: 'waterfowl',
    label: 'Ducks and geese',
    windows: null,
    hours: 'migratory',
    note: 'Dates vary by zone. Federal duck stamp and migratory bird license required.',
  },
  {
    // Digest PDF p. 47 (printed p. 45): woodcock statewide Oct 17-Dec 8, 3 daily, 9 possession,
    // closed Sundays. Hours: ½ hour before sunrise to sunset (Hunting Hours Table exception 4).
    species: 'woodcock',
    label: 'American woodcock',
    windows: [['2026-10-17', '2026-12-08']],
    hours: 'migratory',
    note: 'Daily limit 3. Closed Sundays. Migratory bird license required. Hunting ends at sunset.',
  },
];

/** PA allows Sundays in nearly every 2026-27 season; migratory birds are the exception. */
export const sundayClosed = (species: Species) => migratory.includes(species);

export type SpeciesStatus =
  /** start/end are null when the PGC table has no row for the date or zone: show "check the digest". */
  | { kind: 'open'; season: Season; start: Date | null; end: Date | null }
  | { kind: 'sunday'; season: Season }
  | { kind: 'closed'; nextOpen: { season: Season; date: Ymd } | null }
  | { kind: 'check'; season: Season };

const inWindow = (ymd: Ymd, [a, b]: [Ymd, Ymd]) => ymd >= a && ymd <= b;

/**
 * Legal hours from the official PGC table. hunt_start/hunt_end are ½ hour
 * before sunrise / after sunset (small and big game); migratory birds end at
 * sunset; spring gobbler ends at noon through SPRING_NOON_UNTIL.
 */
export function legalHours(hours: Hours, ymd: Ymd, lng: number, table: HoursTable = officialHours) {
  const day = officialDay(ymd, lng, table);
  if (!day) return null;
  if (hours === 'migratory') return { start: day.huntStart, end: day.sunset };
  if (hours === 'springTurkey' && ymd <= SPRING_NOON_UNTIL) {
    return { start: day.huntStart, end: new Date(midnightET(ymd).getTime() + 12 * 3600_000) };
  }
  return { start: day.huntStart, end: day.huntEnd };
}

/** Open/closed status for one species on a given ET date at a location. */
export function speciesStatus(
  species: Species,
  ymd: Ymd,
  at: { lat: number; lng: number },
  table: HoursTable = officialHours,
): SpeciesStatus {
  const relevant = seasons.filter((s) => s.species === species);
  const isSunday = weekdayOf(ymd) === 0;
  // Prefer the general season over the youth season when both apply.
  const open = relevant
    .filter((s) => s.windows?.some((w) => inWindow(ymd, w)))
    .sort((a, b) => Number(!!a.youth) - Number(!!b.youth))[0];
  if (open) {
    if (isSunday && sundayClosed(species)) return { kind: 'sunday', season: open };
    const hours = legalHours(open.hours, ymd, at.lng, table);
    return { kind: 'open', season: open, start: hours?.start ?? null, end: hours?.end ?? null };
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
      const youth = status.season.youth ? 'Youth only · ' : '';
      if (!status.start || !status.end) return `${youth}Open today · hours: check the PGC digest`;
      const range = `${formatTime(status.start)} – ${formatTime(status.end)}`;
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
