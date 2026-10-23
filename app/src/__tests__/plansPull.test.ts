import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Backend, PlanUpload, ServerPlan } from '@/data/backend';
import { backend as appBackend } from '@/data';
import { refreshPlans } from '@/data/hooks';
import { deletePlan, getPlan, listPlans, PLANS_KEY, pullPlans, savePlan, syncPlans, updatePlan, type Plan, type PlanDraft, type PlanPlace } from '@/lib/plans';

const ME = 'user-me';
const PAL = 'user-pal';
const sgl: PlanPlace = { id: 'sgl-211', name: 'SGL 211', type: 'game_land', access: 'state_game_land', center: { lng: -76.7, lat: 40.45 }, species: ['pheasant'] };
const other: PlanPlace = { ...sgl, id: 'sgl-46', name: 'SGL 46' };
const resolve = (id: string) => ({ 'sgl-211': sgl, 'sgl-46': other })[id] ?? null;
const draft = (date = '2026-11-14'): PlanDraft => ({ place: sgl, date, species: ['pheasant'], notes: '', reminder: 'none', crew: null });

/** In-memory hosted public.plans: one table shared by "devices"; RLS-ish view per user. */
function server() {
  const rows = new Map<string, ServerPlan>();
  const as = (userId: string, crews: string[] = []) =>
    ({
      upsertPlan: jest.fn(async (p: PlanUpload) => {
        const prev = rows.get(p.clientId);
        rows.set(p.clientId, { ...p, userId, crewName: p.crewId ? 'Ridge Crew' : null, createdAt: prev?.createdAt ?? '2026-10-23T12:00:00Z', updatedAt: new Date().toISOString() });
        return { shared: !!p.crewId };
      }),
      deletePlan: jest.fn(async (id: string) => {
        rows.delete(id);
      }),
      listServerPlans: jest.fn(async () => [...rows.values()].filter((r) => r.userId === userId || (r.crewId && crews.includes(r.crewId)))),
    }) as unknown as Backend & { listServerPlans: jest.Mock };
  const row = (over: Partial<ServerPlan> = {}): ServerPlan => ({
    clientId: `c-${rows.size + 1}`,
    userId: ME,
    placeId: 'sgl-211',
    placeName: 'SGL 211',
    planDate: '2026-11-20',
    species: ['pheasant'],
    notes: 'from the server',
    reminder: 'none',
    crewId: null,
    crewName: null,
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...over,
  });
  return { rows, as, put: (r: ServerPlan) => rows.set(r.clientId, r), row };
}

beforeEach(() => AsyncStorage.clear());

describe('plans pull + merge by client_id', () => {
  it('cross-device: a plan made on another phone appears here, synced', async () => {
    const s = server();
    const phoneB = s.as(ME);
    await savePlan(ME, draft('2026-11-21'), new Date('2026-10-23T12:00:00Z'));
    await syncPlans(phoneB, ME); // phone B pushes
    await AsyncStorage.clear(); // phone A has nothing yet
    const r = await pullPlans(s.as(ME), ME, resolve);
    expect(r).toMatchObject({ added: 1, removed: 0 });
    const [p] = await listPlans(ME);
    expect(p).toMatchObject({ date: '2026-11-21', sync: 'synced', owner: ME, place: { id: 'sgl-211', center: sgl.center } });
    expect(p.readOnly).toBeUndefined();
  });

  it('server copy replaces a synced local row (edited on another device)', async () => {
    const s = server();
    const be = s.as(ME);
    const p = await savePlan(ME, draft());
    await syncPlans(be, ME);
    s.put({ ...s.rows.get(p.id)!, notes: 'edited on tablet', planDate: '2026-11-28', updatedAt: '2026-10-24T01:00:00Z' });
    expect(await pullPlans(be, ME, resolve)).toMatchObject({ updated: 1 });
    expect(await getPlan(p.id)).toMatchObject({ notes: 'edited on tablet', date: '2026-11-28', sync: 'synced' });
  });

  it('conflict: a pending local edit wins over the server until it is pushed', async () => {
    const s = server();
    const be = s.as(ME);
    const p = await savePlan(ME, draft());
    await syncPlans(be, ME);
    s.put({ ...s.rows.get(p.id)!, notes: 'server edit' });
    await updatePlan(p.id, { notes: 'phone edit' }); // offline: stays pending
    await pullPlans(be, ME, resolve);
    expect(await getPlan(p.id)).toMatchObject({ notes: 'phone edit', sync: 'pending' });
    await syncPlans(be, ME);
    await pullPlans(be, ME, resolve);
    expect(s.rows.get(p.id)!.notes).toBe('phone edit');
    expect(await getPlan(p.id)).toMatchObject({ notes: 'phone edit', sync: 'synced' });
  });

  it('conflict: a pending local delete wins (server row not resurrected); push then removes it', async () => {
    const s = server();
    const be = s.as(ME);
    const p = await savePlan(ME, draft());
    await syncPlans(be, ME);
    await deletePlan(p.id);
    await pullPlans(be, ME, resolve);
    expect(await getPlan(p.id)).toBeNull();
    expect(await listPlans(ME)).toHaveLength(0);
    await syncPlans(be, ME);
    expect(s.rows.has(p.id)).toBe(false);
    await pullPlans(be, ME, resolve);
    expect(JSON.parse((await AsyncStorage.getItem(PLANS_KEY))!)).toHaveLength(0);
  });

  it('deleted on the server: removed locally if synced, kept if it has an unpushed change', async () => {
    const s = server();
    const be = s.as(ME);
    const synced = await savePlan(ME, draft('2026-11-14'));
    const pending = await savePlan(ME, draft('2026-11-15'));
    await syncPlans(be, ME);
    await updatePlan(pending.id, { notes: 'not pushed yet' });
    s.rows.clear(); // deleted on another device
    const r = await pullPlans(be, ME, resolve);
    expect(r.removed).toBe(1);
    expect(await getPlan(synced.id)).toBeNull();
    expect(await getPlan(pending.id)).toMatchObject({ notes: 'not pushed yet', sync: 'pending' });
  });

  it('never-pushed local plans survive a pull (server does not know them yet)', async () => {
    const s = server();
    const p = await savePlan(ME, draft());
    await pullPlans(s.as(ME), ME, resolve);
    expect(await getPlan(p.id)).toMatchObject({ sync: 'pending' });
  });

  it('crew-shared plans from others are added read-only, never pushed, and can’t be edited or deleted here', async () => {
    const s = server();
    s.put(s.row({ clientId: 'pal-1', userId: PAL, crewId: 'crew-1', crewName: 'Ridge Crew', placeId: 'sgl-46', placeName: 'SGL 46' }));
    s.put(s.row({ clientId: 'pal-private', userId: PAL })); // not shared: RLS hides it
    const be = s.as(ME, ['crew-1']);
    await pullPlans(be, ME, resolve);
    const list = await listPlans(ME);
    expect(list.map((p) => p.id)).toEqual(['pal-1']);
    expect(list[0]).toMatchObject({ owner: PAL, account: ME, readOnly: true, crew: { id: 'crew-1', name: 'Ridge Crew' }, place: { id: 'sgl-46' } });
    expect(await listPlans(PAL)).toHaveLength(0); // filed under the viewer, not the maker
    await updatePlan('pal-1', { notes: 'hijack' });
    await deletePlan('pal-1');
    expect(await getPlan('pal-1')).toMatchObject({ notes: 'from the server' });
    await syncPlans(be, ME);
    expect(be.upsertPlan).not.toHaveBeenCalled();
    expect(be.deletePlan).not.toHaveBeenCalled();
    // Unshared by the maker → gone on the next pull.
    s.put({ ...s.rows.get('pal-1')!, crewId: null });
    await pullPlans(be, ME, resolve);
    expect(await listPlans(ME)).toHaveLength(0);
  });

  it('a server row for a spot not loaded yet is skipped (counted), not stored with a made-up location', async () => {
    const s = server();
    s.put(s.row({ placeId: 'unknown-spot' }));
    expect(await pullPlans(s.as(ME), ME, resolve)).toMatchObject({ added: 0, unresolved: 1 });
    expect(await listPlans(ME)).toHaveLength(0);
  });

  it('pull failure keeps the local store untouched', async () => {
    const s = server();
    const be = s.as(ME);
    await savePlan(ME, draft());
    await syncPlans(be, ME);
    const before = await AsyncStorage.getItem(PLANS_KEY);
    be.listServerPlans.mockRejectedValueOnce(new Error('offline'));
    await expect(pullPlans(be, ME, resolve)).rejects.toThrow('offline');
    expect(await AsyncStorage.getItem(PLANS_KEY)).toBe(before);
    expect(await listPlans(ME)).toHaveLength(1);
  });

  it('other accounts’ rows on the phone are left alone', async () => {
    const s = server();
    const theirs = await savePlan(PAL, draft());
    await AsyncStorage.setItem(PLANS_KEY, JSON.stringify(JSON.parse((await AsyncStorage.getItem(PLANS_KEY))!).map((p: Plan) => ({ ...p, sync: 'synced' }))));
    await pullPlans(s.as(ME), ME, resolve);
    expect(await getPlan(theirs.id)).not.toBeNull();
  });
});

describe('refreshPlans (app start / Profile focus)', () => {
  it('signed out: no push, no pull', async () => {
    const spy = jest.spyOn(appBackend, 'listServerPlans');
    // The hooks session has not been started in this file, so there is no signed-in user.
    expect(await refreshPlans()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
