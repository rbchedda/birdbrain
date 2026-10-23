import AsyncStorage from '@react-native-async-storage/async-storage';

import { deletePlan, getPlan, listPlans, savePlan, setReminderScheduler, splitPlans, updatePlan, type PlanDraft } from '@/lib/plans';

const draft = (date: string): PlanDraft => ({
  place: { id: 'sgl-211', name: 'SGL 211', type: 'game_land', access: 'state_game_land', center: { lng: -76.7, lat: 40.45 }, species: [] },
  date,
  species: ['pheasant'],
  notes: '  bring the dog  ',
  reminder: 'none',
  crew: null,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  setReminderScheduler(async () => false);
});

describe('local plans store', () => {
  it('saves locally per owner, sorted soonest first, phone-only with the flag off', async () => {
    await savePlan('u1', draft('2026-10-30'));
    await savePlan('u1', draft('2026-10-24'));
    await savePlan('u2', draft('2026-10-25'));
    const mine = await listPlans('u1');
    expect(mine.map((p) => p.date)).toEqual(['2026-10-24', '2026-10-30']);
    expect(mine[0].notes).toBe('bring the dog');
    expect(mine[0].sync).toBe('local');
  });

  it('splits upcoming and past; past starts the day after', async () => {
    await savePlan('u1', draft('2026-10-22'));
    await savePlan('u1', draft('2026-10-23'));
    const s = splitPlans(await listPlans('u1'), '2026-10-23');
    expect(s.upcoming.map((p) => p.date)).toEqual(['2026-10-23']);
    expect(s.past.map((p) => p.date)).toEqual(['2026-10-22']);
  });

  it('caps notes at 500, edits and deletes', async () => {
    const p = await savePlan('u1', { ...draft('2026-10-24'), notes: 'x'.repeat(600) });
    expect(p.notes).toHaveLength(500);
    await updatePlan(p.id, { notes: 'new' });
    expect((await getPlan(p.id))?.notes).toBe('new');
    await deletePlan(p.id);
    expect(await getPlan(p.id)).toBeNull();
  });

  it('records whether a reminder was really scheduled', async () => {
    const off = await savePlan('u1', { ...draft('2026-10-24'), reminder: 'night_before' });
    expect(off.reminderScheduled).toBe(false);
    const sched = jest.fn(async () => true);
    setReminderScheduler(sched);
    const on = await savePlan('u1', { ...draft('2026-10-24'), reminder: 'hour_before' });
    expect(on.reminderScheduled).toBe(true);
    expect(sched).toHaveBeenCalledTimes(1);
  });
});
