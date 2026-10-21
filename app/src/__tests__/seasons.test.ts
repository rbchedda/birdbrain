import { describeStatus, placeToday, speciesStatus } from '@/data/seasons';
import type { Place } from '@/data/types';
import { sunTimes } from '@/lib/sun';
import { ago, etParts, formatTime, midnightET, nextMidnightET } from '@/lib/time';

const harrisburg = { lat: 40.27, lng: -76.88 };

describe('time helpers', () => {
  it('finds midnight Eastern across DST', () => {
    expect(midnightET('2026-07-02').toISOString()).toBe('2026-07-02T04:00:00.000Z');
    expect(midnightET('2026-11-15').toISOString()).toBe('2026-11-15T05:00:00.000Z');
  });

  it('matches public.next_day_et, including evenings after UTC rolls over', () => {
    expect(nextMidnightET(new Date('2026-11-14T23:30:00-05:00')).toISOString()).toBe('2026-11-15T05:00:00.000Z');
    expect(nextMidnightET(new Date('2026-07-01T10:00:00-04:00')).toISOString()).toBe('2026-07-02T04:00:00.000Z');
  });

  it('reads the Eastern calendar date', () => {
    expect(etParts(new Date('2026-10-22T03:00:00Z')).ymd).toBe('2026-10-21');
  });

  it('formats relative ages', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(ago('2026-10-21T10:00:00Z', now)).toBe('2h');
    expect(ago('2026-10-19T12:00:00Z', now)).toBe('2d');
  });
});

describe('sunrise and sunset', () => {
  it('is close to published times for Harrisburg', () => {
    // NOAA: Oct 21 2026 sunrise ~7:21 AM, sunset ~6:22 PM EDT.
    const sun = sunTimes('2026-10-21', harrisburg.lat, harrisburg.lng)!;
    const minutes = (d: Date) => etParts(d).hour * 60 + etParts(d).minute;
    expect(Math.abs(minutes(sun.sunrise) - (7 * 60 + 21))).toBeLessThanOrEqual(4);
    expect(Math.abs(minutes(sun.sunset) - (18 * 60 + 22))).toBeLessThanOrEqual(4);
  });
});

describe('season status', () => {
  it('opens pheasant on the general opener with legal hours half an hour before sunrise', () => {
    const s = speciesStatus('pheasant', '2026-10-24', harrisburg);
    expect(s.kind).toBe('open');
    if (s.kind !== 'open') return;
    const sun = sunTimes('2026-10-24', harrisburg.lat, harrisburg.lng)!;
    expect(sun.sunrise.getTime() - s.start.getTime()).toBe(30 * 60_000);
    expect(s.end).toEqual(sun.sunset);
  });

  it('treats the junior week as youth-only', () => {
    const s = speciesStatus('pheasant', '2026-10-12', harrisburg);
    expect(s.kind === 'open' && s.season.youth).toBe(true);
  });

  it('closes doves on Sundays but keeps upland birds open', () => {
    // 2026-10-25 is a Sunday.
    expect(speciesStatus('dove', '2026-10-25', harrisburg).kind).toBe('sunday');
    expect(speciesStatus('pheasant', '2026-10-25', harrisburg).kind).toBe('open');
  });

  it('closes pheasant on Christmas and names the next opener', () => {
    const s = speciesStatus('pheasant', '2026-12-25', harrisburg);
    expect(s).toMatchObject({ kind: 'closed', nextOpen: { date: '2026-12-26' } });
    expect(describeStatus(s)).toBe('Closed · opens Sat, Dec 26');
  });

  it('sends waterfowl hunters to the zone table', () => {
    expect(speciesStatus('waterfowl', '2026-11-10', harrisburg).kind).toBe('check');
  });

  it('marks a stocking field open today during pheasant season', () => {
    const place: Place = {
      id: 'x', name: 'Field', type: 'stocking', county: 'Dauphin', species: ['pheasant'],
      center: harrisburg, acres: null,
    };
    const midday = new Date('2026-11-03T16:00:00Z');
    const today = placeToday(place, midday);
    expect(today.open).toBe(true);
    expect(describeStatus(today.statuses[0].status, midday)).toMatch(/^Open today · \d+:\d\d AM – \d+:\d\d PM$/);
    expect(formatTime(new Date('2026-11-03T16:00:00Z'))).toBe('11:00 AM');
  });
});
