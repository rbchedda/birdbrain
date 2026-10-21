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
  version: '2026-27.1',
  asOf: '2026-10-21',
  season: '2026-27',
  species: {
    pheasant: {
      daily: '2 (either sex)',
      possession: '6',
      sunday: 'open',
      sundayNote: 'All 21 Sundays in the pheasant season are open.',
    },
    grouse: {
      daily: '2',
      possession: '6',
      sunday: 'open',
      sundayNote: 'Sundays open in 2026-27.',
    },
    turkey: {
      daily: '1 per license year (fall); spring 1, or 2 with a second tag',
      possession: 'Same as the season limit',
      sunday: 'check',
      sundayNote: 'Sunday turkey hunting varies by season and WMU; check the digest.',
    },
    dove: {
      daily: '15',
      possession: '45',
      sunday: 'closed',
      sundayNote: 'Closed Sundays (migratory birds).',
    },
    waterfowl: {
      daily: 'Varies by species and zone',
      possession: '3 × daily',
      sunday: 'closed',
      sundayNote: 'Closed Sundays (migratory birds).',
    },
  },
};

export const regsFor = (species: Species) => REGS.species[species];
