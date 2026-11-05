import type { JournalEntry } from '@/data/journal';
import {
  MIN_BEST_SAMPLE,
  WEEK_HALF_WIDTH,
  daysBetween,
  pastSeasonsForPlace,
  remapToYear,
  sameCalendarWeek,
  timeBucket,
} from '@/data/pastSeasons';
import { emptyDiaryDetails, type DiaryDetails, type Species } from '@/data/types';

let n = 0;
function entry(
  huntedOn: string,
  placeId: string | null,
  d: Partial<DiaryDetails> = {},
  extra: Partial<JournalEntry> = {},
  species: Species = 'pheasant',
): JournalEntry {
  n++;
  return {
    id: `ps${n}`,
    clientId: `ps${n}`,
    author: { id: 'me', username: null, displayName: 'You' },
    mine: true,
    kind: 'hunt',
    species,
    caption: '',
    createdAt: `${huntedOn}T12:00:00Z`,
    publicAfter: null,
    huntedOn,
    location: 'hidden',
    area: null,
    counts: null,
    placeCounts: [{ placeId, placeName: placeId ?? 'typed', flushed: d.flushes ?? 0, roosters: 0, harvested: 0 }],
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: { status: 'synced', version: 1, rev: 0, attempts: 0, nextAttemptAt: 0, error: null, conflict: false },
    details: { ...emptyDiaryDetails(), species: [species], ...d },
    ...extra,
  };
}

describe('week matching (±3 day-of-year, remapped)', () => {
  it(`uses a ±${WEEK_HALF_WIDTH}-day window around the same month/day`, () => {
    expect(sameCalendarWeek('2024-11-05', '2026-11-05')).toBe(true);
    expect(sameCalendarWeek('2024-11-02', '2026-11-05')).toBe(true); // -3
    expect(sameCalendarWeek('2024-11-08', '2026-11-05')).toBe(true); // +3
    expect(sameCalendarWeek('2024-11-01', '2026-11-05')).toBe(false); // -4
    expect(sameCalendarWeek('2024-11-09', '2026-11-05')).toBe(false); // +4
  });

  it('handles the year boundary (Dec ↔ Jan) via circular day distance', () => {
    expect(sameCalendarWeek('2024-12-30', '2026-01-01')).toBe(true); // circular gap 2
    expect(sameCalendarWeek('2024-12-29', '2026-01-01')).toBe(true); // gap 3
    expect(sameCalendarWeek('2024-12-28', '2026-01-01')).toBe(false); // gap 4
    expect(sameCalendarWeek('2025-01-02', '2024-12-31')).toBe(true);
    expect(daysBetween('2026-01-01', '2026-01-03')).toBe(2);
  });

  it('clamps Feb 29 onto Feb 28 in a non-leap reference year', () => {
    expect(remapToYear('2024-02-29', 2025)).toBe('2025-02-28');
    expect(sameCalendarWeek('2024-02-29', '2025-02-27')).toBe(true); // mapped Feb 28, |1| ≤ 3
    expect(sameCalendarWeek('2024-02-29', '2025-03-03')).toBe(true); // mapped Feb 28 → 3 days
    expect(sameCalendarWeek('2024-02-29', '2025-03-04')).toBe(false);
  });

  it('keeps Feb 29 in a leap reference year', () => {
    expect(remapToYear('2020-02-29', 2024)).toBe('2024-02-29');
    expect(sameCalendarWeek('2020-02-29', '2024-02-29')).toBe(true);
  });
});

describe('pastSeasonsForPlace', () => {
  const place = 'sgl-211';

  it('returns an honest empty state with no invented numbers', () => {
    const s = pastSeasonsForPlace([], place, '2026-11-05');
    expect(s.empty).toBe(true);
    expect(s.huntCount).toBe(0);
    expect(s.flushes).toBe(0);
    expect(s.harvest).toBe(0);
    expect(s.bestTime).toBeNull();
    expect(s.bestWeather).toBeNull();
    expect(s.note).toMatch(/No hunts logged/);
  });

  it('ignores the current season and other places', () => {
    const es = [
      entry('2026-11-04', place, { flushes: 5 }), // current season 2026-27
      entry('2025-11-04', 'other', { flushes: 9 }),
      entry('2025-11-04', null, { flushes: 9 }), // no placeId
      entry('2025-11-04', place, { flushes: 3, birds: [{ species: 'pheasant', count: 1 }] }),
    ];
    const s = pastSeasonsForPlace(es, place, '2026-11-05');
    expect(s.huntCount).toBe(1);
    expect(s.flushes).toBe(3);
    expect(s.harvest).toBe(1);
    expect(s.seasons).toBe(1);
    expect(s.empty).toBe(false);
    expect(s.bestTime).toBeNull(); // below MIN_BEST_SAMPLE
    expect(s.bestWeather).toBeNull();
  });

  it('aggregates across multiple prior seasons in the same week window', () => {
    const es = [
      entry('2025-11-05', place, { flushes: 4 }),
      entry('2024-11-06', place, { flushes: 7 }),
      entry('2023-11-03', place, { flushes: 2 }),
      entry('2024-10-01', place, { flushes: 99 }), // outside window
    ];
    const s = pastSeasonsForPlace(es, place, '2026-11-05');
    expect(s.huntCount).toBe(3);
    expect(s.seasons).toBe(3);
    expect(s.flushes).toBe(13);
    expect(s.note).toMatch(/3 hunts across 3 prior seasons/);
    expect(s.note).toMatch(/13 flushes/);
  });

  it(`withholds the best-time hint below ${MIN_BEST_SAMPLE} timed hunts`, () => {
    const es = [
      entry('2025-11-05', place, { flushes: 4, startTime: '07:30' }),
      entry('2024-11-05', place, { flushes: 1, startTime: '07:00' }),
    ];
    expect(pastSeasonsForPlace(es, place, '2026-11-05').bestTime).toBeNull();
  });

  it('picks the time-of-day bucket with the highest flush rate once the sample is big enough', () => {
    const es = [
      entry('2025-11-05', place, { flushes: 8, startTime: '07:30' }),
      entry('2024-11-04', place, { flushes: 6, startTime: '08:00' }),
      entry('2023-11-06', place, { flushes: 1, startTime: '12:00' }),
      entry('2022-11-05', place, { flushes: 0, startTime: '15:00' }),
    ];
    const s = pastSeasonsForPlace(es, place, '2026-11-05');
    expect(s.bestTime).toEqual({ bucket: 'morning', label: 'Morning (before 10)', sample: 4 });
  });

  it('picks weather from the best flush day only with a large enough weather sample', () => {
    const wx = (tempF: number, windDir: string, windMph: number) => ({
      tempF,
      windDir,
      windMph,
      sky: 'clear' as string | null,
      precip: null,
    });
    const es = [
      entry('2025-11-05', place, { flushes: 10, weather: wx(42, 'NW', 8) }),
      entry('2024-11-05', place, { flushes: 2, weather: wx(55, 'S', 3) }),
      entry('2023-11-05', place, { flushes: 1, weather: wx(48, 'W', 12) }),
    ];
    const s = pastSeasonsForPlace(es, place, '2026-11-05');
    expect(s.bestWeather?.text).toBe('NW wind 8 mph · 42°F · clear');
    expect(s.bestWeather?.sample).toBe(3);
  });

  it('small-sample: shows counts but never a best-time or weather hint', () => {
    const s = pastSeasonsForPlace(
      [entry('2025-11-05', place, { flushes: 5, startTime: '07:00', weather: { tempF: 40, windMph: 5, windDir: 'N', sky: null, precip: null } })],
      place,
      '2026-11-05',
    );
    expect(s.huntCount).toBe(1);
    expect(s.flushes).toBe(5);
    expect(s.bestTime).toBeNull();
    expect(s.bestWeather).toBeNull();
  });
});

describe('timeBucket', () => {
  it('splits morning / midday / afternoon', () => {
    expect(timeBucket('06:30')).toBe('morning');
    expect(timeBucket('09:59')).toBe('morning');
    expect(timeBucket('10:00')).toBe('midday');
    expect(timeBucket('13:59')).toBe('midday');
    expect(timeBucket('14:00')).toBe('afternoon');
  });
});
