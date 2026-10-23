import {
  birdChips,
  birdForQuery,
  distanceDecay,
  emptyReason,
  rankMap,
  resultBounds,
  isUncoveredBird,
  matchBirds,
  rankSpots,
  seasonTag,
  type SearchFilters,
} from '@/data/speciesSearch';
import type { Place } from '@/data/types';

const origin = { lng: -77.9, lat: 40.8 };
const at = (dLat: number) => ({ lng: origin.lng, lat: origin.lat + dLat });
const place = (p: Partial<Place> & Pick<Place, 'id' | 'type'>): Place => ({
  name: p.id,
  county: 'Centre',
  species: [],
  center: origin,
  acres: null,
  access: 'state_game_land',
  ...p,
});
const all: SearchFilters = { openNow: false, publicOnly: false, radiusMi: 100 };

describe('bird matching', () => {
  it('matches names and aliases from 2 chars', () => {
    expect(matchBirds('p')).toEqual([]);
    expect(matchBirds('ringneck').map((b) => b.key)).toEqual(['pheasant']);
    expect(matchBirds('partridge').map((b) => b.key)).toEqual(['grouse']);
    expect(matchBirds('timberdoodle').map((b) => b.key)).toEqual(['woodcock']);
    expect(matchBirds('do').map((b) => b.key)).toContain('dove');
    expect(birdForQuery('  Wild Turkey ')?.key).toBe('turkey');
    expect(birdForQuery('Gettysburg')).toBeNull();
  });
  it('flags birds we do not cover yet', () => {
    expect(isUncoveredBird('quail')).toBe(true);
    expect(isUncoveredBird('ducks')).toBe(true);
    expect(isUncoveredBird('spring gobbler')).toBe(true);
    expect(isUncoveredBird('centre')).toBe(false);
  });
});

describe('season tags (2026-27)', () => {
  it('pheasant closed before Oct 24, open on opening day', () => {
    expect(seasonTag('pheasant', '2026-10-23', origin)).toEqual({ kind: 'closed', label: expect.stringContaining('Closed until') });
    expect(seasonTag('pheasant', '2026-10-24', origin).kind).toBe('open');
  });
  it('woodcock closed Sundays', () => {
    expect(seasonTag('woodcock', '2026-10-25', origin).label).toBe('Closed Sundays');
    expect(seasonTag('woodcock', '2026-10-24', origin).kind).toBe('open');
  });
  it('fall turkey opens Oct 31, then needs the WMU', () => {
    expect(seasonTag('turkey', '2026-10-30', origin).kind).toBe('closed');
    expect(seasonTag('turkey', '2026-10-31', origin).kind).toBe('open');
    expect(seasonTag('turkey', '2026-11-10', origin).kind).toBe('check');
    expect(seasonTag('turkey', '2026-12-01', origin).kind).toBe('closed');
  });
  it('puts in-season birds first in the chips', () => {
    const keys = birdChips('2026-10-23', origin).map((b) => b.key);
    expect(keys.slice(-2).sort()).toEqual(['pheasant', 'turkey']);
  });
});

describe('rankSpots', () => {
  const places = [
    place({ id: 'near-small', type: 'game_land', center: at(0.05), acres: 500 }),
    place({ id: 'far-big', type: 'game_land', center: at(0.6), acres: 20000 }),
    place({ id: 'dove-field', type: 'dove_field', species: ['dove'], center: at(0.2) }),
    place({ id: 'stock', type: 'stocking', species: ['pheasant'], center: at(0.1) }),
    place({ id: 'private', type: 'stocking', species: ['pheasant'], access: 'enrolled_private', center: at(0.1) }),
  ];

  it('scores 0.6 fit + 0.4 decay and ranks from 1', () => {
    const r = rankSpots('grouse', places, origin, all, '2026-10-24');
    expect(r.map((x) => x.place.id)).toEqual(['near-small', 'far-big']);
    expect(r[0].rank).toBe(1);
    const fit = 0.4 + 0.5 * (500 / 5000);
    expect(r[0].score).toBeCloseTo(fit * 0.6 + distanceDecay(r[0].miles) * 0.4);
    expect(r[0].reason).toMatch(/500 acres/);
  });
  it('dove fields beat game lands for dove', () => {
    expect(rankSpots('dove', places, origin, all, '2026-10-24')[0].place.id).toBe('dove-field');
  });
  it('excludes closed seasons unless Show closed, and respects radius', () => {
    const open = { ...all, openNow: true };
    expect(rankSpots('pheasant', places, origin, open, '2026-10-23')).toEqual([]);
    expect(emptyReason('pheasant', '2026-10-23', origin, open)).toBe('season_closed');
    expect(rankSpots('pheasant', places, origin, all, '2026-10-23').length).toBeGreaterThan(0);
    expect(rankSpots('grouse', places, origin, { ...all, radiusMi: 25 }, '2026-10-24').map((x) => x.place.id)).toEqual(['near-small']);
  });
  it('public only drops enrolled private; private rows say permission rules', () => {
    const r = rankSpots('pheasant', places, origin, all, '2026-10-24');
    expect(r.find((x) => x.place.id === 'private')?.accessNote).toMatch(/permission rules/);
    expect(rankSpots('pheasant', places, origin, { ...all, publicOnly: true }, '2026-10-24').some((x) => x.place.id === 'private')).toBe(false);
  });
  it('ties go to the nearer spot; caps at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => place({ id: `g${i}`, type: 'game_land', center: at(0.01 * (30 - i)) }));
    const r = rankSpots('woodcock', many, origin, all, '2026-10-24');
    expect(r).toHaveLength(20);
    expect(r[0].place.id).toBe('g29');
  });
  it('fits the camera exactly to origin + top 5 and maps ranks', () => {
    const r = rankSpots('grouse', places, origin, all, '2026-10-24');
    expect(resultBounds(origin, r)).toEqual([
      [origin.lng, origin.lat],
      [origin.lng, origin.lat + 0.6],
    ]);
    expect(rankMap(r)).toEqual({ 'near-small': 1, 'far-big': 2 });
  });
});
