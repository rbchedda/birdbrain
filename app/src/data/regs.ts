import type { Species } from './types';

/**
 * Bag limits and Sunday rules, entered by hand from the PGC 2026-27 Hunting &
 * Trapping Digest and the PGC Seasons and Bag Limits page. There is no API for
 * these, so the table is versioned and dated, and the app shows the date and
 * links to PGC. Bump REGS.version and asOf on every edit; get a second person
 * to check each change against the digest.
 */
export const PGC_DIGEST_URL =
  'https://www.pa.gov/content/dam/copapwp-pagov/en/pgc/documents/hunttrap/law/pa%20game%20hunttrap%20digest%2026-27.pdf';
/**
 * HuntFishPA license store link for the Licenses page. Null hides the
 * "Buy on HuntFishPA ›" link.
 */
export const HUNTFISHPA_URL: string | null = 'https://huntfish.pa.gov/';

export const PGC_SEASONS_URL = 'https://www.pa.gov/agencies/pgc/huntingandtrapping/regulations/seasons-and-bag-limits';

export type SundayRule = 'open' | 'closed' | 'check';

export interface SpeciesRegs {
  /** Daily bag, as the digest states it. */
  daily: string;
  /** Possession limit, as the digest states it. */
  possession: string;
  sunday: SundayRule;
  sundayNote: string;
}

export interface Regs {
  version: string;
  /** Date the table was last checked against PGC sources (YYYY-MM-DD). */
  asOf: string;
  season: string;
  species: Record<Species, SpeciesRegs>;
}

export const REGS: Regs = {
  version: '2026-27.3',
  asOf: '2026-10-21',
  season: '2026-27',
  species: {
    pheasant: {
      daily: '2 (either sex)',
      possession: '6',
      sunday: 'open',
      // Counted against digest p.7: junior Oct 10-18 = 2 Sundays; statewide Oct 24-Dec 24 = 9,
      // Dec 26-Feb 28, 2027 = 10 (19 statewide).
      sundayNote: 'Sundays open: 19 statewide Sundays plus 2 in the junior season.',
    },
    grouse: {
      daily: '2',
      possession: '6',
      sunday: 'open',
      sundayNote: 'Sundays open in 2026-27.',
    },
    turkey: {
      daily: 'Fall 1 per season (no fall season in WMUs 5C and 5D); spring 1 bearded bird per season',
      possession: 'Season limit',
      sunday: 'open',
      sundayNote: 'Sundays open, spring and fall.',
    },
    dove: {
      daily: '15',
      possession: '45',
      sunday: 'closed',
      sundayNote: 'Closed Sundays (migratory birds).',
    },
    waterfowl: {
      daily: 'Varies by species and zone',
      possession: 'See digest (federal exceptions)',
      sunday: 'closed',
      sundayNote: 'Closed Sundays (migratory birds).',
    },
  },
};

export const regsFor = (species: Species) => REGS.species[species];

/** WMUs with no fall turkey season in 2026-27. */
export const NO_FALL_TURKEY_WMUS = ['5C', '5D'];

/**
 * Digest p.4: every season includes Sundays except migratory birds. Exception:
 * state parks and preserves in these counties allow Sunday hunting only on
 * SE_PARK_SUNDAYS.
 */
export const SE_PARK_SUNDAY_COUNTIES = ['Bucks', 'Chester', 'Delaware', 'Montgomery', 'Philadelphia'];
export const SE_PARK_SUNDAYS = ['2026-11-15', '2026-11-22', '2026-11-29'];
export const SE_PARK_SUNDAY_NOTE =
  'State parks and preserves in Bucks, Chester, Delaware, Montgomery and Philadelphia counties: Sundays only on Nov 15, 22 and 29.';

/** Whether Sunday hunting is allowed for a species on a Sunday, optionally in a SE state park/preserve. */
export function sundayAllowed(species: Species, ymd: string, opts: { county?: string; stateParkOrPreserve?: boolean } = {}) {
  if (REGS.species[species].sunday === 'closed') return false;
  if (opts.stateParkOrPreserve && opts.county && SE_PARK_SUNDAY_COUNTIES.includes(opts.county)) {
    return SE_PARK_SUNDAYS.includes(ymd);
  }
  return true;
}
