import { officialDay, officialHours, type HoursTable } from '@/lib/sun';
import { formatDay, formatTime, midnightET, todayET, weekdayOf, type Ymd } from '@/lib/time';

import { season2026_27 } from './seasonSets/2026-27';
import {
  currentSeason,
  latestSeasonSet,
  seasonSetFor,
  seasonSetsFrom,
  seasonYearOf,
  unpublishedLine,
  type CurrentSeason,
} from './seasonRegistry';
import type { Hours, Season, SeasonSet, SeasonYear } from './seasonTypes';
import { allSpecies, migratory, type Place, type Species } from './types';

/**
 * Season status, hours and labels. The rules themselves live in the SEASONS registry
 * (data/seasonRegistry.ts, one file per year under data/seasonSets/); everything here
 * resolves the set for the date first and says "not published yet" when there is none.
 */
export type { Hours, Season, SeasonSet, SeasonYear };
export { currentSeason, seasonYearOf, unpublishedLine, type CurrentSeason };

/** Newest published season year. Prefer currentSeason(ymd).year for anything shown for a date. */
export const SEASON_YEAR = latestSeasonSet().year;

/** 2026-27 spring gobbler noon cut-off (kept for callers/tests; per-year value is set.springNoonUntil). */
export const SPRING_NOON_UNTIL: Ymd = season2026_27.springNoonUntil;

/** Seasons of the newest published set. Date-aware code should use seasonsOn(ymd). */
export const seasons: Season[] = latestSeasonSet().seasons;

/** Seasons in force on a date (empty when the year is unpublished). */
export const seasonsOn = (ymd: Ymd): Season[] => seasonSetFor(ymd)?.seasons ?? [];

/** PA allows Sundays in nearly every 2026-27 season; migratory birds are the exception. */
export const sundayClosed = (species: Species) => migratory.includes(species);

export type SpeciesStatus =
  /** start/end are null when the PGC table has no row for the date or zone: show "check the digest". */
  | { kind: 'open'; season: Season; start: Date | null; end: Date | null }
  | { kind: 'sunday'; season: Season }
  | { kind: 'closed'; nextOpen: { season: Season; date: Ymd } | null }
  | { kind: 'check'; season: Season }
  /** No published rules for this season year: never show Closed / Out of season. */
  | { kind: 'unpublished'; year: SeasonYear };

const inWindow = (ymd: Ymd, [a, b]: [Ymd, Ymd]) => ymd >= a && ymd <= b;

/**
 * Legal hours from the official PGC table. hunt_start/hunt_end are ½ hour
 * before sunrise / after sunset (small and big game); migratory birds end at
 * sunset; spring gobbler ends at noon through that season's springNoonUntil.
 */
export function legalHours(hours: Hours, ymd: Ymd, lng: number, table: HoursTable = officialHours) {
  const day = officialDay(ymd, lng, table);
  if (!day) return null;
  if (hours === 'migratory') return { start: day.huntStart, end: day.sunset };
  const noonUntil = seasonSetFor(ymd)?.springNoonUntil;
  if (hours === 'springTurkey' && noonUntil && ymd <= noonUntil) {
    return { start: day.huntStart, end: new Date(midnightET(ymd).getTime() + 12 * 3600_000) };
  }
  return { start: day.huntStart, end: day.huntEnd };
}

/** Earliest season start after ymd for a species, searching this and later published years. */
function nextOpenFor(species: Species, ymd: Ymd): { season: Season; date: Ymd } | null {
  let nextOpen: { season: Season; date: Ymd } | null = null;
  for (const set of seasonSetsFrom(ymd)) {
    for (const s of set.seasons) {
      if (s.species !== species) continue;
      for (const [start] of s.windows ?? []) {
        if (start > ymd && (!nextOpen || start < nextOpen.date)) nextOpen = { season: s, date: start };
      }
    }
  }
  return nextOpen;
}

/** Open/closed status for one species on a given ET date at a location. */
export function speciesStatus(
  species: Species,
  ymd: Ymd,
  at: { lat: number; lng: number },
  table: HoursTable = officialHours,
): SpeciesStatus {
  const cur = currentSeason(ymd);
  if (cur.kind === 'unpublished') return { kind: 'unpublished', year: cur.year };
  const relevant = cur.set.seasons.filter((s) => s.species === species);
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
  return { kind: 'closed', nextOpen: nextOpenFor(species, ymd) };
}

/** Species a place is managed for. Game lands carry none in the data and allow all. */
export const placeSpecies = (place: Pick<Place, 'species'>): Species[] => (place.species.length ? place.species : allSpecies);

export interface PlaceToday {
  date: Ymd;
  open: boolean;
  statuses: { species: Species; status: SpeciesStatus }[];
  /** Season year when its dates aren't published (no definite open/closed), else null/absent. */
  unpublished?: SeasonYear | null;
}

export function placeToday(place: Place, now = new Date()): PlaceToday {
  const date = todayET(now);
  const statuses = placeSpecies(place).map((species) => ({
    species,
    status: speciesStatus(species, date, place.center),
  }));
  const cur = currentSeason(date);
  return {
    date,
    open: statuses.some((s) => s.status.kind === 'open' && !s.status.season.youth),
    statuses,
    unpublished: cur.kind === 'unpublished' ? cur.year : null,
  };
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
    case 'unpublished':
      return unpublishedLine(status.year);
    case 'closed':
      if (!status.nextOpen) return 'Out of season';
      return `Closed · opens ${formatDay(status.nextOpen.date)}${status.nextOpen.season.youth ? ' (youth)' : ''}`;
  }
}

/** "Tue, Sep 1, 2026": formatDay plus the year, for ranges outside the current season. */
export const formatDayYear = (ymd: Ymd) => `${formatDay(ymd)}, ${ymd.slice(0, 4)}`;

/** A window label; dates outside the season year of `from` carry their year. */
export function rangeLabel([a, b]: [Ymd, Ymd], from: Ymd): string {
  const year = seasonYearOf(from);
  const fmt = (d: Ymd) => (seasonYearOf(d) === year ? formatDay(d) : formatDayYear(d));
  return `${fmt(a)} – ${fmt(b)}`;
}

/** Upcoming or current windows for the Learn screen. */
export function seasonWindows(season: Season, from: Ymd) {
  return (season.windows ?? []).map(([a, b]) => ({
    label: rangeLabel([a, b], from),
    current: inWindow(from, [a, b]),
    past: b < from,
  }));
}
