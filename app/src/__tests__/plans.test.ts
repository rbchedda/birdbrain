import AsyncStorage from '@react-native-async-storage/async-storage';

import { NotSignedInError, type Backend, type PlanUpload } from '@/data/backend';
import { deletePlan, getPlan, listPlans, savePlan, setReminderScheduler, splitPlans, syncPlans, updatePlan, type PlanDraft } from '@/lib/plans';

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
  it('saves locally per owner, sorted soonest first, queued for sync (flag on by default)', async () => {
    await savePlan('u1', draft('2026-10-30'));
    await savePlan('u1', draft('2026-10-24'));
    await savePlan('u2', draft('2026-10-25'));
    const mine = await listPlans('u1');
    expect(mine.map((p) => p.date)).toEqual(['2026-10-24', '2026-10-30']);
    expect(mine[0].notes).toBe('bring the dog');
    expect(mine[0].sync).toBe('pending');
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
    const off = await savePlan('u1', { ...draft('2026-10-24'), reminder: 'night_before_8pm' });
    expect(off.reminderScheduled).toBe(false);
    const sched = jest.fn(async () => true);
    setReminderScheduler(sched);
    const on = await savePlan('u1', { ...draft('2026-10-24'), reminder: 'hour_before_legal' });
    expect(on.reminderScheduled).toBe(true);
    expect(sched).toHaveBeenCalledTimes(1);
  });
});

describe('plans sync to public.plans', () => {
  const fake = () => {
    const rows = new Map<string, PlanUpload>();
    const backend = {
      upsertPlan: jest.fn(async (p: PlanUpload) => {
        rows.set(p.clientId, p);
        return { shared: !!p.crewId && p.crewId !== 'not-mine' };
      }),
      deletePlan: jest.fn(async (id: string) => {
        rows.delete(id);
      }),
    } as unknown as Backend;
    return { rows, backend };
  };

  it('queues offline, pushes by client id with the hosted reminder values, and is idempotent', async () => {
    const { rows, backend } = fake();
    const p = await savePlan('u1', { ...draft('2026-10-31'), reminder: 'night_before_8pm' });
    expect(p.sync).toBe('pending');
    (backend.upsertPlan as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    expect(await syncPlans(backend, 'u1')).toEqual({ pushed: 0, failed: 1 });
    expect((await getPlan(p.id))!.sync).toBe('pending');
    await syncPlans(backend, 'u1');
    expect((await getPlan(p.id))!.sync).toBe('synced');
    expect(rows.get(p.id)).toMatchObject({ clientId: p.id, placeId: 'sgl-211', placeName: 'SGL 211', planDate: '2026-10-31', reminder: 'night_before_8pm', crewId: null });
    expect(await syncPlans(backend, 'u1')).toEqual({ pushed: 0, failed: 0 });
  });

  it('pushes edits and crew sharing; flags a refused share', async () => {
    const { rows, backend } = fake();
    const p = await savePlan('u1', draft('2026-10-31'));
    await syncPlans(backend, 'u1');
    await updatePlan(p.id, { crew: { id: 'crew-1', name: 'Tuesday Dogs' } });
    await syncPlans(backend, 'u1');
    expect(rows.get(p.id)!.crewId).toBe('crew-1');
    expect((await getPlan(p.id))!.shareFailed).toBe(false);
    await updatePlan(p.id, { crew: { id: 'not-mine', name: 'X' } });
    await syncPlans(backend, 'u1');
    expect((await getPlan(p.id))!.shareFailed).toBe(true);
  });

  it('deletes leave a hidden tombstone until the delete is pushed; other owners untouched', async () => {
    const { rows, backend } = fake();
    const p = await savePlan('u1', draft('2026-10-31'));
    const other = await savePlan('u2', draft('2026-10-31'));
    await syncPlans(backend, 'u1');
    await deletePlan(p.id);
    expect(await getPlan(p.id)).toBeNull();
    expect(rows.has(p.id)).toBe(true);
    await syncPlans(backend, 'u1');
    expect(rows.has(p.id)).toBe(false);
    expect(backend.upsertPlan).not.toHaveBeenCalledWith(expect.objectContaining({ clientId: other.id }));
  });

  it('stops at sign-out and keeps the queue', async () => {
    const { backend } = fake();
    (backend.upsertPlan as jest.Mock).mockRejectedValue(new NotSignedInError());
    await savePlan('u1', draft('2026-10-31'));
    await savePlan('u1', draft('2026-11-01'));
    expect(await syncPlans(backend, 'u1')).toEqual({ pushed: 0, failed: 1 });
    expect((await listPlans('u1')).every((x) => x.sync === 'pending')).toBe(true);
  });
});
