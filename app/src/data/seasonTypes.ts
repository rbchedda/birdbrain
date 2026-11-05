import type { Ymd } from '@/lib/time';

import type { Species } from './types';

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

/** A PA license/season year, Jul 1 – Jun 30, e.g. '2026-27'. */
export type SeasonYear = `${number}-${number}`;

/**
 * One published season's rules. Every date-bound rule the app uses lives here, so adding a
 * season is one new file plus a SEASONS entry (docs/adding-a-season.md).
 */
export interface SeasonSet {
  year: SeasonYear;
  /** The PGC digest the dates come from. */
  digestUrl: string;
  seasons: Season[];
  /** Last day of noon-only spring gobbler hours. */
  springNoonUntil: Ymd;
  /** Sundays when SE state parks/preserves (Bucks, Chester, Delaware, Montgomery, Philadelphia) allow hunting. */
  seParkSundays: Ymd[];
  /** Fall turkey varies by WMU: first open day, earliest WMU close, latest WMU close. */
  fallTurkey: { open: Ymd; firstClose: Ymd; lastClose: Ymd };
}
