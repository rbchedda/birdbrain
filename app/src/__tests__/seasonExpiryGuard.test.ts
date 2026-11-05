import { currentSeason } from '@/data/seasonRegistry';
import { addDays, todayET } from '@/lib/time';

/**
 * CI guard: fails when the date 60 days from now (real clock) has no published season in the
 * SEASONS registry. Expected to start failing around May 2027 until 2027-28 is added. That is the
 * point: add the season (never invented dates) per docs/adding-a-season.md.
 */
const LEAD_DAYS = 60;

it(`a season is published for today + ${LEAD_DAYS} days`, () => {
  const target = addDays(todayET(), LEAD_DAYS);
  const cur = currentSeason(target);
  if (cur.kind === 'unpublished') {
    throw new Error(
      `No season rules for ${cur.year} (needed by ${target}). Add data/seasonSets/${cur.year}.ts from the PGC digest ` +
        'and register it in SEASONS: see docs/adding-a-season.md. Do not guess dates.',
    );
  }
  expect(cur.kind).toBe('known');
});
