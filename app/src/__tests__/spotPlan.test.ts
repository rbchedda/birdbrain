import type { Place } from '@/data/types';
import {
  coordsText,
  dayChipLabel,
  directionsTarget,
  directionsUrls,
  forecastAvailable,
  nextDays,
  nextOpenDate,
  openSpecies,
  openTags,
  planSeasonClosed,
  reminderAt,
  seasonDates,
  speciesChoices,
  statusTag,
  todayRow,
  whatToHunt,
} from '@/lib/spotPlan';

const sgl: Place = {
  id: 'sgl-211',
  name: 'SGL 211 · Stony Creek',
  type: 'game_land',
  county: 'Dauphin',
  species: [],
  center: { lng: -76.7, lat: 40.45 },
  acres: 44000,
  access: 'state_game_land',
};
const stocked: Place = { ...sgl, id: 'stk-1', type: 'stocking', species: ['pheasant'], access: 'other_public' };

describe('spot detail helpers', () => {
  it('open species and peek tags cap at two plus n', () => {
    const open = openSpecies(sgl, '2026-10-24');
    expect(open).toEqual(expect.arrayContaining(['pheasant', 'grouse', 'woodcock', 'dove']));
    expect(openTags(open)).toEqual([expect.stringMatching(/ open$/), expect.stringMatching(/ open$/), `+${open.length - 2}`]);
    expect(openTags(['pheasant'])).toEqual(['Pheasant open']);
    expect(openTags([])).toEqual([]);
  });

  it('today row counts open species with legal hours', () => {
    const row = todayRow(stocked, '2026-10-24');
    expect(row.title).toBe('Today: 1 species open');
    expect(row.detail).toMatch(/^Pheasant · legal hours \d+:\d\d AM – \d+:\d\d PM$/);
    expect(todayRow(stocked, '2026-10-20').title).toBe('Today: nothing open');
  });

  it('status tags: Open, Opens Sat, Closes Nov 8 style, Closed', () => {
    expect(statusTag('pheasant', sgl, '2026-10-21').text).toBe('Opens Sat');
    expect(statusTag('pheasant', sgl, '2026-10-01').text).toBe('Opens Oct 24');
    expect(statusTag('pheasant', sgl, '2026-11-01').text).toBe('Open');
    expect(statusTag('woodcock', sgl, '2026-11-30').text).toBe('Closes Dec 8');
    expect(statusTag('pheasant', sgl, '2027-03-15').text).toBe('Closed');
  });

  it('season dates list every general segment', () => {
    expect(seasonDates('pheasant')).toBe('Oct 24 – Dec 24, Dec 26 – Feb 28');
  });

  it('groups good fit and possible, no bag limits', () => {
    const g = whatToHunt(stocked, '2026-10-24');
    expect(g.good.map((r) => r.species)).toEqual(['pheasant']);
    expect(g.good[0].reason).toBe('PGC stocks this property');
    expect(g.possible).toEqual([]);
    const s = whatToHunt(sgl, '2026-10-24');
    expect(s.good.length + s.possible.length).toBe(6);
    expect(JSON.stringify(s)).not.toMatch(/bag|daily limit/i);
  });

  it('plan days, chip labels and forecast window', () => {
    expect(nextDays('2026-10-23')).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(dayChipLabel('2026-10-23', '2026-10-23')).toBe('Today');
    expect(dayChipLabel('2026-10-24', '2026-10-23')).toBe('Tomorrow');
    expect(dayChipLabel('2026-10-25', '2026-10-23')).toBe('Sun 25');
    expect(forecastAvailable('2026-10-29', '2026-10-23')).toBe(true);
    expect(forecastAvailable('2026-10-30', '2026-10-23')).toBe(false);
  });

  it('species choices disable closed species with their open date', () => {
    const c = speciesChoices(stocked, '2026-10-21');
    expect(c).toEqual([{ species: 'pheasant', open: false, hint: 'Opens Oct 24' }]);
    expect(nextOpenDate(stocked, '2026-10-21')).toBe('2026-10-24');
    expect(planSeasonClosed(stocked, '2027-03-15', ['pheasant'])).toBe(true);
    expect(planSeasonClosed(stocked, '2026-11-02', ['pheasant'])).toBe(false);
  });

  it('reminders: 8 PM ET the night before, 1 hr before legal start', () => {
    expect(reminderAt('none', '2026-10-24', sgl.center)).toBeNull();
    expect(reminderAt('night_before_8pm', '2026-10-24', sgl.center)?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    const h = reminderAt('hour_before_legal', '2026-10-24', sgl.center)!;
    expect(h.getUTCHours()).toBeGreaterThanOrEqual(9);
    expect(h.getUTCHours()).toBeLessThanOrEqual(10);
  });

  it('directions go to parking, else the spot point', () => {
    expect(directionsTarget(sgl)).toEqual(sgl.center);
    expect(directionsTarget({ ...sgl, parking: { lng: -76.6, lat: 40.4 } })).toEqual({ lng: -76.6, lat: 40.4 });
    const u = directionsUrls(sgl.center, 'SGL 211');
    expect(u.apple).toContain('daddr=40.45,-76.7');
    expect(u.google).toContain('destination=40.45,-76.7');
    expect(u.waze).toContain('ll=40.45,-76.7');
    expect(coordsText(sgl.center)).toBe('40.45000, -76.70000');
  });
});
