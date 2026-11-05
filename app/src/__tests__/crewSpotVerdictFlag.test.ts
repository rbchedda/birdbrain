import {
  CREW_VERDICT_COLUMN_NAMES,
  PLANS_SELECT_BASE,
  PLANS_SELECT_WITH_CREW_VERDICT,
  planUpsertCols,
  planUpsertColumnKeys,
  plansSelectColumns,
} from '@/data/plansHostedColumns';
import type { PlanUpload } from '@/data/backend';
import { flags } from '@/lib/flags';

const FLAG = 'EXPO_PUBLIC_FLAG_CREW_SPOT_VERDICT';

const sampleUpload: PlanUpload = {
  clientId: 'c1',
  placeId: 'p1',
  placeName: 'SGL Test',
  planDate: '2026-11-15',
  species: ['pheasant'],
  notes: 'hi',
  reminder: 'none',
  crewId: 'crew1',
  showSpotVerdictToCrew: true,
  spotVerdictSnapshot: {
    word: 'Productive',
    line: 'line',
    crewHonestLine: "Pat's history here · 3 past hunts · not a prediction or a report of birds now",
    stockingLine: null,
    dots: [],
    huntsCounted: 3,
    frozen: false,
    computedAt: '2026-11-08T12:00:00.000Z',
    reference: '2026-11-15',
  },
};

describe('EXPO_PUBLIC_FLAG_CREW_SPOT_VERDICT (default OFF)', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });

  it('defaults off', () => {
    delete process.env[FLAG];
    expect(flags.crewSpotVerdict).toBe(false);
  });

  it('with flag off: select string is exactly origin/dev base (no crew columns)', () => {
    delete process.env[FLAG];
    expect(flags.crewSpotVerdict).toBe(false);
    expect(plansSelectColumns()).toBe(PLANS_SELECT_BASE);
    expect(plansSelectColumns()).toBe(
      'user_id, client_id, place_id, place_name, plan_date, species, notes, reminder, crew_id, created_at, updated_at',
    );
    for (const col of CREW_VERDICT_COLUMN_NAMES) {
      expect(plansSelectColumns()).not.toContain(col);
    }
  });

  it('with flag off: upsert payload keys omit both crew columns', () => {
    delete process.env[FLAG];
    const keys = planUpsertColumnKeys();
    const cols = planUpsertCols(sampleUpload);
    expect(keys).toEqual(['place_id', 'place_name', 'plan_date', 'species', 'notes', 'reminder']);
    expect(Object.keys(cols).sort()).toEqual([...keys].sort());
    for (const col of CREW_VERDICT_COLUMN_NAMES) {
      expect(keys).not.toContain(col);
      expect(cols).not.toHaveProperty(col);
    }
    // Even when the PlanUpload carries opt-in + snapshot, they must not hit the wire.
    expect(JSON.stringify(cols)).not.toContain('show_spot_verdict');
    expect(JSON.stringify(cols)).not.toContain('spot_verdict_snapshot');
  });

  it('with flag on: select and upsert include both columns', () => {
    process.env[FLAG] = '1';
    expect(flags.crewSpotVerdict).toBe(true);
    expect(plansSelectColumns()).toBe(PLANS_SELECT_WITH_CREW_VERDICT);
    for (const col of CREW_VERDICT_COLUMN_NAMES) {
      expect(plansSelectColumns()).toContain(col);
    }
    const keys = planUpsertColumnKeys();
    const cols = planUpsertCols(sampleUpload);
    expect(keys).toEqual([
      'place_id',
      'place_name',
      'plan_date',
      'species',
      'notes',
      'reminder',
      'show_spot_verdict_to_crew',
      'spot_verdict_snapshot',
    ]);
    expect(cols.show_spot_verdict_to_crew).toBe(true);
    expect(cols.spot_verdict_snapshot).toEqual(sampleUpload.spotVerdictSnapshot);
  });

  it('with flag on but opt-in false: upsert sends false + null snapshot', () => {
    process.env[FLAG] = '1';
    const cols = planUpsertCols({ ...sampleUpload, showSpotVerdictToCrew: false, spotVerdictSnapshot: sampleUpload.spotVerdictSnapshot });
    expect(cols.show_spot_verdict_to_crew).toBe(false);
    expect(cols.spot_verdict_snapshot).toBeNull();
  });
});

describe('local PlanUpload / sync path never invents snake_case columns', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });

  it('toUpload uses camelCase only; snake_case crew columns absent when flag off', () => {
    delete process.env[FLAG];
    // Inline shape mirror of lib/plans toUpload — assert no snake_case leak in the sync DTO.
    const upload: PlanUpload = {
      clientId: 'x',
      placeId: 'p',
      placeName: 'N',
      planDate: '2026-11-08',
      species: [],
      notes: '',
      reminder: 'none',
      crewId: null,
      showSpotVerdictToCrew: true,
      spotVerdictSnapshot: null,
    };
    const json = JSON.stringify(upload);
    expect(json).not.toContain('show_spot_verdict_to_crew');
    expect(json).not.toContain('spot_verdict_snapshot');
    // Hosted wire payload still strips them when flag is off.
    const wire = planUpsertCols(upload);
    expect(Object.keys(wire)).not.toEqual(expect.arrayContaining([...CREW_VERDICT_COLUMN_NAMES]));
    for (const col of CREW_VERDICT_COLUMN_NAMES) expect(wire).not.toHaveProperty(col);
  });
});

describe('hosted + UI source gates', () => {
  it('supabaseBackend plans select/upsert go through plansHostedColumns helpers', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../data/supabaseBackend.ts'), 'utf8');
    expect(src).toContain('plansSelectColumns()');
    expect(src).toContain('planUpsertCols(p)');
    // No hard-coded select list that includes the new columns (flag-off path must match origin/dev).
    expect(src).not.toMatch(/\.select\([^)]*show_spot_verdict_to_crew/);
    expect(src).not.toMatch(/show_spot_verdict_to_crew:\s*p\.showSpotVerdictToCrew/);
  });

  it('plan detail crew toggle and crew card are gated on flags.crewSpotVerdict', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../app/plans/[id].tsx'), 'utf8');
    expect(src).toContain('flags.crewSpotVerdict');
    expect(src).toMatch(/flags\.crewSpotVerdict && plan\.readOnly/);
    expect(src).toMatch(/flags\.crewSpotVerdict && !plan\.readOnly && !!plan\.crew/);
  });
});
