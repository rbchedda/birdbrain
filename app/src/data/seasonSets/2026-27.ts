import type { Ymd } from '@/lib/time';

import type { Season, SeasonSet } from '../seasonTypes';

/**
 * 2026-27 Pennsylvania season calendar, statewide dates only. Compiled from
 * PGC's approved 2026-27 seasons as reported in October 2026. Turkey dates vary
 * by WMU and waterfowl by zone. Always defer to the PGC Hunting & Trapping
 * Digest; the app says so wherever it shows these.
 */

/**
 * Last day of noon-only spring gobbler hours. The digest says May 15; PGC's
 * Apr 11, 2026 release says May 16. Using the digest until PGC confirms.
 */
const SPRING_NOON_UNTIL: Ymd = '2027-05-15';

// Pheasant dates: digest PDF p. 42 (printed p. 40, junior Oct 10-18) and PDF p. 43 (printed p. 41,
// statewide Oct 24-Dec 24 & Dec 26-Feb 28, 2027). Verified 2026-10-22; also matches pa.gov seasons page.
const seasons: Season[] = [
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

export const season2026_27: SeasonSet = {
  year: '2026-27',
  digestUrl: 'https://www.pa.gov/content/dam/copapwp-pagov/en/pgc/documents/hunttrap/law/pa%20game%20hunttrap%20digest%2026-27.pdf',
  seasons,
  springNoonUntil: SPRING_NOON_UNTIL,
  // Digest p.4 (moved from data/regs.ts).
  seParkSundays: ['2026-11-15', '2026-11-22', '2026-11-29'],
  // Fall turkey 2026-27 (digest PDF p.35): opens Oct 31 in every WMU but 5C/5D; the end varies by WMU
  // (Nov 3 at the earliest, Nov 27 at the latest). Moved from data/speciesSearch.ts.
  fallTurkey: { open: '2026-10-31', firstClose: '2026-11-03', lastClose: '2026-11-27' },
};
