import { addDays, type Ymd } from '@/lib/time';

import { season2026_27 } from './seasonSets/2026-27';
import type { SeasonSet, SeasonYear } from './seasonTypes';

/**
 * Every published PA season the app knows, keyed by license year (Jul 1 – Jun 30).
 * Add next season's file here; never guess dates (docs/adding-a-season.md).
 * A year missing from this map is "unpublished": the app says so instead of "Closed".
 */
export const SEASONS: Partial<Record<SeasonYear, SeasonSet>> = {
  '2026-27': season2026_27,
};

/** PA seasons run Jul 1 – Jun 30: '2026-27'. */
export function seasonYearOf(ymd: Ymd): SeasonYear {
  const y = Number(ymd.slice(0, 4));
  const start = Number(ymd.slice(5, 7)) >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}` as SeasonYear;
}

/** First and last day of a season year. */
export function seasonBounds(year: SeasonYear): { start: Ymd; end: Ymd } {
  const y = Number(year.slice(0, 4));
  return { start: `${y}-07-01`, end: `${y + 1}-06-30` };
}

export const nextSeasonYear = (year: SeasonYear) => seasonYearOf(addDays(seasonBounds(year).end, 1));
export const prevSeasonYear = (year: SeasonYear) => seasonYearOf(addDays(seasonBounds(year).start, -1));

export type CurrentSeason = { kind: 'known'; year: SeasonYear; set: SeasonSet } | { kind: 'unpublished'; year: SeasonYear };

/** The season rules in force on an ET date, or 'unpublished' when PGC dates for that year aren't in the app. */
export function currentSeason(ymd: Ymd): CurrentSeason {
  const year = seasonYearOf(ymd);
  const set = SEASONS[year];
  return set ? { kind: 'known', year, set } : { kind: 'unpublished', year };
}

/** The season set for a date, or null when unpublished. */
export const seasonSetFor = (ymd: Ymd): SeasonSet | null => SEASONS[seasonYearOf(ymd)] ?? null;

/** Exact copy (engineer, Nov 2026): "2027-28 dates not published yet. Check the PGC hunting digest." */
export const unpublishedLine = (year: SeasonYear) => `${year} dates not published yet. Check the PGC hunting digest.`;

/** Known sets, oldest first. */
export const knownSeasonSets = (): SeasonSet[] =>
  (Object.values(SEASONS) as SeasonSet[]).sort((a, b) => a.year.localeCompare(b.year));

/** The newest published set (what the Guide falls back to, labelled as last season). */
export const latestSeasonSet = (): SeasonSet => knownSeasonSets()[knownSeasonSets().length - 1];

/** Known sets for the date's season year and later, oldest first (for "next opener" lookups). */
export const seasonSetsFrom = (ymd: Ymd): SeasonSet[] => knownSeasonSets().filter((s) => s.year >= seasonYearOf(ymd));

/**
 * The set to show on a date: the current one, else the newest published one with a label.
 * label is null for the current season, '2026-27 (last season)' for the previous year, else '2025-26'.
 */
export function displaySeasonSet(ymd: Ymd): { set: SeasonSet; current: boolean; label: string | null } {
  const cur = currentSeason(ymd);
  if (cur.kind === 'known') return { set: cur.set, current: true, label: null };
  const set = knownSeasonSets().filter((s) => s.year < cur.year).pop() ?? latestSeasonSet();
  return { set, current: false, label: set.year === prevSeasonYear(cur.year) ? `${set.year} (last season)` : set.year };
}

/** Whether a range belongs to the season year of `ymd` (else it must show its year). */
export const inSeasonYear = (a: Ymd, ymd: Ymd) => seasonYearOf(a) === seasonYearOf(ymd);
