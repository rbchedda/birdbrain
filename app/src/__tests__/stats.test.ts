import type { JournalEntry } from '@/data/journal';
import { badges, dogStats, gameLandOf, lifeList, recap, seasonOf, seasonStats } from '@/data/stats';
import { emptyDiaryDetails, type DiaryDetails, type Species } from '@/data/types';

let n = 0;
function entry(huntedOn: string, place: string, d: Partial<DiaryDetails> = {}, species: Species = 'pheasant'): JournalEntry {
  n++;
  return {
    id: `e${n}`,
    clientId: `e${n}`,
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
    placeCounts: [{ placeId: null, placeName: place, flushed: 0, roosters: 0, harvested: 0 }],
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: { status: 'synced', version: 1, rev: 0, attempts: 0, nextAttemptAt: 0, error: null, conflict: false },
    details: { ...emptyDiaryDetails(), species: [species], ...d },
  };
}

const ruby = { dogId: 'ruby', name: 'Ruby', points: 0, flushes: 0, retrieves: 0 };
const fixtures = [
  entry('2026-10-19', 'SGL 211', { flushes: 11, shots: 4, miles: 4, hours: 3, dogs: [{ ...ruby, points: 9, retrieves: 2 }], cover: ['cut_corn'], weather: { tempF: 48, windMph: 8, windDir: 'NW', sky: null, precip: null }, birds: [{ species: 'pheasant', count: 2, roosters: 2, hens: 0 }] }),
  entry('2026-10-19', 'SGL 211', { flushes: 1 }),
  entry('2026-10-12', 'Private pin', { flushes: 6, shots: 2, dogs: [{ ...ruby, points: 20 }] }, 'grouse'),
  entry('2026-10-05', 'State Game Lands 246', { flushes: 22, miles: 50 }, 'dove'),
  entry('2026-03-01', 'SGL 100', { flushes: 3 }, 'turkey'),
];

describe('season stats', () => {
  it('splits PA seasons on Jul 1', () => {
    expect(seasonOf('2026-06-30')).toBe('2025-26');
    expect(seasonOf('2026-07-01')).toBe('2026-27');
    expect(seasonOf('2027-01-15')).toBe('2026-27');
  });

  it('leads with days afield and counts effort, not birds', () => {
    const st = seasonStats(fixtures, '2026-27');
    expect(st).toMatchObject({ daysAfield: 3, hunts: 4, flushes: 40, shots: 6, miles: 54, hours: 3, dogPoints: 29, gameLands: 2, places: 3 });
    expect(Object.keys(st)).not.toContain('birds');
    expect(st.byMonth).toEqual([{ month: '2026-10', days: 3, flushes: 40, shots: 6, points: 29 }]);
    expect(st.heat.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('reads SGL numbers from typed place names', () => {
    expect(gameLandOf(fixtures[3])).toBe('SGL 246');
    expect(gameLandOf(fixtures[2])).toBeNull();
  });
});

describe('life list', () => {
  it('lists species and SGLs hunted with first dates and flags new ones', () => {
    const life = lifeList(fixtures, '2026-27');
    expect(life.find((i) => i.label === 'turkey')).toMatchObject({ first: '2026-03-01', isNew: false });
    expect(life.find((i) => i.label === 'dove')).toMatchObject({ first: '2026-10-05', isNew: true });
    expect(life.filter((i) => i.kind === 'game_land').map((i) => i.label).sort()).toEqual(['SGL 100', 'SGL 211', 'SGL 246']);
  });
});

describe('dogs', () => {
  it('totals per-dog points, flushes, retrieves and miles', () => {
    expect(dogStats(fixtures, [{ id: 'ruby', name: 'Ruby', breed: null }, { id: 'duke', name: 'Duke', breed: null }])).toEqual([
      { dogId: 'ruby', name: 'Ruby', hunts: 2, points: 29, flushes: 0, retrieves: 2, miles: 4 },
      { dogId: 'duke', name: 'Duke', hunts: 0, points: 0, flushes: 0, retrieves: 0, miles: 0 },
    ]);
  });
});

describe('badges', () => {
  const b = Object.fromEntries(badges(fixtures, '2026-27').map((x) => [x.id, x]));

  it('uses marketing’s effort/variety list and never harvest trophies', () => {
    const names = badges([], '2026-27').map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['Boot Leather', 'Game Lands Rambler', 'Five-Bird Season', 'Good Dog', 'Mentor', 'Dawn Patrol']));
    expect(names).toHaveLength(16);
    for (const banned of ['Limit Out', 'Double', 'Rooster King', 'Sharpshooter']) expect(names).not.toContain(banned);
  });

  it('awards from effort and dog work', () => {
    expect(b['boot-leather']).toMatchObject({ earned: true, progress: '50/50' });
    expect(b['good-dog']).toMatchObject({ earned: true, progress: '25/25' });
    expect(b['game-lands-rambler']).toMatchObject({ earned: false, progress: '3/10' });
    expect(b['new-ground'].earned).toBe(true);
    expect(b['dry-spell-survivor']).toMatchObject({ earned: false, progress: '4/5' });
    expect(b.mentor).toMatchObject({ tracked: false, earned: false });
  });

  it('earns Dawn Patrol for starts near legal light', () => {
    const early = Array.from({ length: 5 }, (_, i) => entry(`2026-11-${String(10 + i).padStart(2, '0')}`, 'SGL 1', { startTime: '06:40' }));
    const late = Array.from({ length: 5 }, (_, i) => entry(`2026-11-${String(10 + i).padStart(2, '0')}`, 'SGL 1', { startTime: '11:00' }));
    expect(badges(early, '2026-27').find((x) => x.id === 'dawn-patrol')?.earned).toBe(true);
    expect(badges(late, '2026-27').find((x) => x.id === 'dawn-patrol')?.earned).toBe(false);
  });
});

describe('recap card', () => {
  it('reads like marketing’s copy and never includes bird totals', () => {
    const st = seasonStats(fixtures, '2026-27');
    const r = recap(st, dogStats(fixtures));
    expect(r.headline).toEqual(['3 DAYS.', '40 FLUSHES.', 'ONE GOOD DOG.']);
    expect(r.subline).toBe('2 game lands · 0 counties');
    expect(JSON.stringify(r)).not.toMatch(/bird|harvest|rooster|bag/i);
  });
});
