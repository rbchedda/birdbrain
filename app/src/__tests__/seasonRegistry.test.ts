import {
  SEASONS,
  currentSeason,
  displaySeasonSet,
  knownSeasonSets,
  nextSeasonYear,
  seasonBounds,
  seasonYearOf,
  unpublishedLine,
} from '@/data/seasonRegistry';
import type { SeasonSet } from '@/data/seasonTypes';

describe('season years', () => {
  it('runs Jul 1 – Jun 30', () => {
    expect(seasonYearOf('2026-06-30')).toBe('2025-26');
    expect(seasonYearOf('2026-07-01')).toBe('2026-27');
    expect(seasonYearOf('2027-06-30')).toBe('2026-27');
    expect(seasonYearOf('2027-07-01')).toBe('2027-28');
    expect(seasonYearOf('2099-12-31')).toBe('2099-00');
    expect(seasonBounds('2026-27')).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(nextSeasonYear('2026-27')).toBe('2027-28');
  });

  it('resolves the current season or says it is unpublished (2027-28 is NOT in the app)', () => {
    expect(currentSeason('2026-11-05')).toMatchObject({ kind: 'known', year: '2026-27' });
    expect(currentSeason('2027-06-30')).toMatchObject({ kind: 'known', year: '2026-27' });
    expect(currentSeason('2027-07-01')).toEqual({ kind: 'unpublished', year: '2027-28' });
    expect(currentSeason('2027-09-15')).toEqual({ kind: 'unpublished', year: '2027-28' });
  });

  it('unpublished copy is exact and derives the year', () => {
    expect(unpublishedLine('2027-28')).toBe('2027-28 dates not published yet. Check the PGC hunting digest.');
    expect(unpublishedLine(seasonYearOf('2028-09-01'))).toBe('2028-29 dates not published yet. Check the PGC hunting digest.');
  });

  it("labels the newest published season as last season only when it is last year's", () => {
    expect(displaySeasonSet('2026-11-05')).toMatchObject({ current: true, label: null });
    expect(displaySeasonSet('2027-09-15')).toMatchObject({ current: false, label: '2026-27 (last season)' });
    expect(displaySeasonSet('2028-09-15')).toMatchObject({ current: false, label: '2026-27' });
  });
});

describe('season coverage: every registered season sits inside its own Jul 1 – Jun 30, no overlaps', () => {
  const sets = knownSeasonSets();
  const inside = (set: SeasonSet, d: string) => {
    const { start, end } = seasonBounds(set.year);
    return d >= start && d <= end;
  };

  it('has at least the 2026-27 season and keys match years', () => {
    expect(sets.map((s) => s.year)).toContain('2026-27');
    for (const [key, set] of Object.entries(SEASONS)) expect(set!.year).toBe(key);
  });

  it.each(knownSeasonSets().map((s) => [s.year, s] as const))('%s: every date is inside the season year', (_y, set) => {
    const dates: string[] = [set.springNoonUntil, ...set.seParkSundays, set.fallTurkey.open, set.fallTurkey.firstClose, set.fallTurkey.lastClose];
    for (const s of set.seasons) for (const [a, b] of s.windows ?? []) {
      expect(a <= b).toBe(true);
      dates.push(a, b);
    }
    expect(dates.filter((d) => !inside(set, d))).toEqual([]);
  });

  it('no two seasons overlap (each owns a distinct Jul 1 – Jun 30)', () => {
    const years = sets.map((s) => s.year);
    expect(new Set(years).size).toBe(years.length);
    for (let i = 1; i < sets.length; i++) expect(seasonBounds(sets[i - 1].year).end < seasonBounds(sets[i].year).start).toBe(true);
  });
});
