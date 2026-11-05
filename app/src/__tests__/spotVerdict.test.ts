import type { JournalEntry } from '@/data/journal';
import { samplePlaces } from '@/data/places';
import {
  CREW_MIN_AGE_MS,
  CREW_TOGGLE_COPY,
  MIN_VISITS,
  VERDICT_MIXED,
  VERDICT_PRODUCTIVE,
  WINDOW,
  computeSpotVerdict,
  crewHonestLine,
  crewMaySeeVerdict,
  huntEndedAt,
  isHuntDayFrozen,
  localMidnightOn,
  localYmd,
  median,
  ownerHonestLine,
  stockingVerdictLine,
  toCrewSnapshot,
  verdictAllowedInShareImage,
  verdictFromSnapshot,
  verdictShareActionsAllowed,
} from '@/data/spotVerdict';
import { emptyDiaryDetails, type DiaryDetails, type Species } from '@/data/types';
import { shareText } from '@/components/stats/ShareCardView';
import type { ShareCard } from '@/data/statsCharts';

const place = samplePlaces.find((p) => p.id === 'sgl-sample-1')!;
const stockPlace = samplePlaces.find((p) => p.id === 'stock-sample-1')!;

let n = 0;
function entry(
  huntedOn: string,
  placeId: string,
  d: Partial<DiaryDetails> & { flushes?: number } = {},
  extra: Partial<JournalEntry> = {},
  species: Species = 'pheasant',
): JournalEntry {
  n++;
  const { flushes = 0, ...details } = d;
  return {
    id: `sv${n}`,
    clientId: `sv${n}`,
    author: { id: 'me', username: null, displayName: 'You' },
    mine: true,
    kind: 'hunt',
    species,
    caption: '',
    createdAt: `${huntedOn}T18:00:00.000Z`,
    publicAfter: null,
    huntedOn,
    location: 'hidden',
    area: null,
    counts: null,
    placeCounts: [{ placeId, placeName: placeId, flushed: flushes, roosters: 0, harvested: 0 }],
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: { status: 'synced', version: 1, rev: 0, attempts: 0, nextAttemptAt: 0, error: null, conflict: false },
    details: {
      ...emptyDiaryDetails(),
      species: [species],
      hours: details.hours ?? 2,
      startTime: details.startTime ?? '08:00',
      flushes,
      ...details,
    },
    ...extra,
  };
}

/** In-season pheasant reference (regular season open). */
const REF = '2026-11-08' as const;

describe('median + thresholds', () => {
  it('orders Productive ≥1.0, Mixed ≥0.4, else Slow', () => {
    expect(VERDICT_PRODUCTIVE).toBe(1.0);
    expect(VERDICT_MIXED).toBe(0.4);
    // 3 hunts @ 2 flushes / 1h → median 2.0 → Productive
    const productive = [
      entry('2026-10-25', place.id, { flushes: 2, hours: 1 }),
      entry('2026-11-01', place.id, { flushes: 2, hours: 1 }),
      entry('2026-11-03', place.id, { flushes: 2, hours: 1 }),
    ];
    expect(computeSpotVerdict({ place, entries: productive, reference: REF }).word).toBe('Productive');

    // 0.5 flushes/h → Mixed
    const mixed = [
      entry('2026-10-25', place.id, { flushes: 1, hours: 2 }),
      entry('2026-11-01', place.id, { flushes: 1, hours: 2 }),
      entry('2026-11-03', place.id, { flushes: 1, hours: 2 }),
    ];
    expect(computeSpotVerdict({ place, entries: mixed, reference: REF }).word).toBe('Mixed');

    // 0.2 flushes/h → Slow
    const slow = [
      entry('2026-10-25', place.id, { flushes: 1, hours: 5 }),
      entry('2026-11-01', place.id, { flushes: 1, hours: 5 }),
      entry('2026-11-03', place.id, { flushes: 1, hours: 5 }),
    ];
    expect(computeSpotVerdict({ place, entries: slow, reference: REF }).word).toBe('Slow');
  });

  it(`needs ${MIN_VISITS} visits with hours for a rate word; window ≤${WINDOW}`, () => {
    expect(computeSpotVerdict({ place, entries: [], reference: REF }).word).toBe('New to you');
    expect(
      computeSpotVerdict({
        place,
        entries: [entry('2026-10-25', place.id, { flushes: 4, hours: 1 })],
        reference: REF,
      }).word,
    ).toBe('New to you');
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('uses exact honest / toggle copy', () => {
    expect(ownerHonestLine(3)).toBe('Based on your 3 hunts here · not a prediction');
    expect(crewHonestLine('Alex', 4)).toBe(
      "Alex's history here · 4 past hunts · not a prediction or a report of birds now",
    );
    expect(CREW_TOGGLE_COPY).toBe(
      "Show my spot verdict to this crew. It's based on my past hunts here, at least 12 hours old, and doesn't update on hunt day.",
    );
  });
});

describe('multi-place exclusion', () => {
  it('shows multi-place as dashed dots and never counts them in the median', () => {
    const multi: JournalEntry = {
      ...entry('2026-11-01', place.id, { flushes: 10, hours: 1 }),
      placeCounts: [
        { placeId: place.id, placeName: 'A', flushed: 10, roosters: 0, harvested: 0 },
        { placeId: 'other', placeName: 'B', flushed: 2, roosters: 0, harvested: 0 },
      ],
    };
    const singles = [
      entry('2026-10-25', place.id, { flushes: 1, hours: 5 }),
      entry('2026-11-01', place.id, { flushes: 1, hours: 5 }),
    ];
    const v = computeSpotVerdict({ place, entries: [...singles, multi], reference: REF });
    expect(v.dots).toContain('no_hours');
    // Only the 2 singles with hours → still New to you (< MIN_VISITS rate pool of window counted)
    // withHoursAll has 2 → Slow/Mixed/Productive path. rates from 2 singles → Slow
    expect(v.word).toBe('Slow');
    expect(v.huntsCounted).toBe(2);
  });
});

describe('stocking line', () => {
  it('never changes the word; uses exact PGC county wording', () => {
    const line = stockingVerdictLine('Centre', 'Nov 3–6');
    expect(line).toBe(
      'PGC lists a pheasant release window for Centre County, Nov 3–6. Releases vary by property and day. This is not a count of birds here. From PGC stocking data.',
    );
    const hunts = [
      entry('2026-10-25', stockPlace.id, { flushes: 2, hours: 1 }),
      entry('2026-11-01', stockPlace.id, { flushes: 2, hours: 1 }),
      entry('2026-11-03', stockPlace.id, { flushes: 2, hours: 1 }),
    ];
    const v = computeSpotVerdict({ place: stockPlace, entries: hunts, reference: REF });
    // Word from hunts only
    expect(v.word).toBe('Productive');
    if (v.stockingLine) {
      expect(v.stockingLine).toMatch(/^PGC lists a pheasant release window for .+ County,/);
      expect(v.stockingLine).toContain('This is not a count of birds here. From PGC stocking data.');
    }
  });
});

describe('crew 12h rule', () => {
  it('excludes hunts that ended less than 12 hours before asOf', () => {
    const planDate = '2026-11-10';
    // Ended ~2h before "now" → excluded for crew
    const recent = entry('2026-11-10', place.id, {
      flushes: 8,
      hours: 1,
      startTime: '06:00',
    });
    // Force endedAt via createdAt close to now
    const now = new Date(2026, 10, 10, 14, 0, 0, 0); // local Nov 10 14:00
    recent.details!.startTime = '12:00';
    recent.details!.hours = 1; // ended 13:00 local — 1h before now
    recent.huntedOn = '2026-11-10';

    const old = entry('2026-10-25', place.id, { flushes: 2, hours: 1, startTime: '08:00' });
    const old2 = entry('2026-11-01', place.id, { flushes: 2, hours: 1, startTime: '08:00' });

    const crew = computeSpotVerdict({
      place,
      entries: [old, old2, recent],
      reference: planDate,
      audience: 'crew',
      ownerDisplayName: 'Sam',
      planDate,
      now,
    });
    // Hunt day → frozen at local midnight; recent hunt ended after midnight so still <12h from midnight? 
    // ended 13:00, asOf = local midnight Nov 10 = 00:00 → ended AFTER asOf → filtered out (age negative)
    expect(crew.frozen).toBe(true);
    expect(crew.huntsCounted).toBe(2);
    expect(crew.crewHonestLine).toContain("Sam's history here");
    expect(crew.crewHonestLine).toContain('not a prediction or a report of birds now');

    const owner = computeSpotVerdict({
      place,
      entries: [old, old2, recent],
      reference: planDate,
      audience: 'owner',
      now,
    });
    expect(owner.frozen).toBe(false);
    expect(owner.huntsCounted).toBe(3);
  });

  it(`CREW_MIN_AGE_MS is 12 hours (${CREW_MIN_AGE_MS})`, () => {
    expect(CREW_MIN_AGE_MS).toBe(12 * 3600_000);
  });
});

describe('hunt-day freeze at local midnight (device TZ)', () => {
  it('isHuntDayFrozen is true only on the Plan local calendar day', () => {
    const planDate = '2026-11-15';
    expect(isHuntDayFrozen(planDate, new Date(2026, 10, 15, 0, 0, 0, 0))).toBe(true);
    expect(isHuntDayFrozen(planDate, new Date(2026, 10, 15, 23, 59, 59, 999))).toBe(true);
    expect(isHuntDayFrozen(planDate, new Date(2026, 10, 14, 23, 59, 59, 999))).toBe(false);
    expect(isHuntDayFrozen(planDate, new Date(2026, 10, 16, 0, 0, 0, 0))).toBe(false);
  });

  it('localMidnightOn is 00:00:00.000 in the device local zone', () => {
    const m = localMidnightOn('2026-11-15');
    expect(m.getFullYear()).toBe(2026);
    expect(m.getMonth()).toBe(10);
    expect(m.getDate()).toBe(15);
    expect(m.getHours()).toBe(0);
    expect(m.getMinutes()).toBe(0);
    expect(m.getSeconds()).toBe(0);
    expect(m.getMilliseconds()).toBe(0);
    expect(localYmd(m)).toBe('2026-11-15');
  });

  it('freeze starts at local midnight on the Plan date — asOf pins the 12h filter', () => {
    const planDate = '2026-11-15';
    // Hunt ended at 10:00 local on plan day — after midnight, so age vs asOf(midnight) is negative → excluded
    const dayHunt = entry('2026-11-15', place.id, { flushes: 20, hours: 2, startTime: '08:00' });
    // Old hunts before the freeze point
    const prior = [
      entry('2026-10-25', place.id, { flushes: 1, hours: 5, startTime: '08:00' }),
      entry('2026-11-01', place.id, { flushes: 1, hours: 5, startTime: '08:00' }),
    ];
    const duringDay = new Date(2026, 10, 15, 16, 30, 0, 0); // 4:30pm local on hunt day
    const frozen = computeSpotVerdict({
      place,
      entries: [...prior, dayHunt],
      reference: planDate,
      audience: 'crew',
      planDate,
      now: duringDay,
      ownerDisplayName: 'Pat',
    });
    expect(frozen.frozen).toBe(true);
    expect(frozen.huntsCounted).toBe(2);
    expect(frozen.word).not.toBe('Productive'); // dayHunt's 10/h not counted

    // Same entries the day before → not frozen; dayHunt isn't in set yet for "now" before plan day
    const dayBefore = new Date(2026, 10, 14, 16, 30, 0, 0);
    const live = computeSpotVerdict({
      place,
      entries: prior,
      reference: planDate,
      audience: 'crew',
      planDate,
      now: dayBefore,
    });
    expect(live.frozen).toBe(false);

    // After local midnight next day, freeze lifts; dayHunt ended 10:00 prior day → ≥12h old by noon next day
    const nextAfternoon = new Date(2026, 10, 16, 12, 0, 0, 0);
    const unfrozen = computeSpotVerdict({
      place,
      entries: [...prior, dayHunt],
      reference: planDate,
      audience: 'crew',
      planDate,
      now: nextAfternoon,
    });
    expect(unfrozen.frozen).toBe(false);
    expect(unfrozen.huntsCounted).toBe(3);
  });

  it('huntEndedAt prefers startTime+hours on huntedOn in local wall time', () => {
    const e = entry('2026-11-15', place.id, { hours: 3, startTime: '07:30' });
    const ended = huntEndedAt(e);
    expect(ended.getHours()).toBe(10);
    expect(ended.getMinutes()).toBe(30);
    expect(localYmd(ended)).toBe('2026-11-15');
  });
});

describe('opt-in default OFF', () => {
  it('crewMaySeeVerdict is false unless explicitly true', () => {
    expect(crewMaySeeVerdict(undefined)).toBe(false);
    expect(crewMaySeeVerdict(null)).toBe(false);
    expect(crewMaySeeVerdict(false)).toBe(false);
    expect(crewMaySeeVerdict(true)).toBe(true);
  });
});

describe('crew: no share, export, or screenshot-share; never in share images', () => {
  it('verdictShareActionsAllowed is always false (crew and owner)', () => {
    expect(verdictShareActionsAllowed('crew')).toBe(false);
    expect(verdictShareActionsAllowed('owner')).toBe(false);
  });

  it('verdictAllowedInShareImage is false for public, crew, and owner', () => {
    expect(verdictAllowedInShareImage('public')).toBe(false);
    expect(verdictAllowedInShareImage('crew')).toBe(false);
    expect(verdictAllowedInShareImage('owner')).toBe(false);
  });

  it('stats ShareCard text never mentions a verdict word or place', () => {
    const card = {
      seasonLabel: '2026-27',
      through: 'Feb',
      days: 4,
      flushes: 12,
      hours: 8,
      gameLands: 2,
      varietyCount: 2,
      months: [{ letter: 'O', days: 1 }, { letter: 'N', days: 3 }],
      heldBack: 0,
    } as ShareCard;
    const text = shareText(card);
    for (const w of ['Productive', 'Mixed', 'Slow', 'Closed', 'New to you', 'verdict', 'SGL', place.name]) {
      expect(text.toLowerCase()).not.toContain(w.toLowerCase());
    }
  });

  it('crew snapshot round-trip keeps audience crew and no share entitlement', () => {
    const hunts = [
      entry('2026-10-25', place.id, { flushes: 2, hours: 1 }),
      entry('2026-11-01', place.id, { flushes: 2, hours: 1 }),
      entry('2026-11-03', place.id, { flushes: 2, hours: 1 }),
    ];
    const v = computeSpotVerdict({
      place,
      entries: hunts,
      reference: REF,
      audience: 'crew',
      ownerDisplayName: 'Kim',
      planDate: '2026-11-20',
      now: new Date(2026, 10, 8, 12, 0, 0, 0),
    });
    const snap = toCrewSnapshot(v, REF);
    const back = verdictFromSnapshot(snap);
    expect(back.audience).toBe('crew');
    expect(verdictShareActionsAllowed(back.audience)).toBe(false);
    expect(back.crewHonestLine).toContain('not a prediction or a report of birds now');
  });
});
