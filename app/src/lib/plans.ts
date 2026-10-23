import { useEffect, useState } from 'react';

import type { AccessType } from '@/data/access';
import { NotSignedInError, type Backend, type PlanUpload, type ServerPlan } from '@/data/backend';
import type { LngLat, PlaceType, Species } from '@/data/types';
import { flags } from '@/lib/flags';
import { newClientId, readJson, updateJson } from '@/lib/localStore';
import type { Reminder } from '@/lib/spotPlan';
import { todayET, type Ymd } from '@/lib/time';

/**
 * Hunt plans (spot-detail spec: Plan a hunt, Profile › Plans). Offline first:
 * every plan is saved on this phone (keyed to the signed-in account) and queued;
 * syncPlans pushes the queue to hosted public.plans (hosted-changes-needed.md
 * §2-3) by client UUID, so replays are idempotent. EXPO_PUBLIC_FLAG_PLANS=0
 * turns sync off (plans stay 'local', phone-only).
 */
export const PLANS_KEY = 'birdbrain.plans.v1';

export interface PlanPlace {
  id: string;
  name: string;
  type: PlaceType;
  access: AccessType;
  center: LngLat;
  species: Species[];
  parking?: LngLat | null;
}

export interface Plan {
  id: string;
  /** Who made the plan (server user_id). */
  owner: string;
  /** Whose phone list this row belongs to; defaults to owner. Differs only for crew-shared plans from others. */
  account?: string;
  /** Crew-shared plan made by someone else: view only, never pushed. */
  readOnly?: boolean;
  place: PlanPlace;
  date: Ymd;
  species: Species[];
  notes: string;
  reminder: Reminder;
  /** True only when a local notification was actually scheduled. */
  reminderScheduled: boolean;
  crew: { id: string; name: string } | null;
  /** 'local': phone-only (flag off). 'pending': waiting to sync (flag on). */
  sync: 'local' | 'pending' | 'synced';
  /** Tombstone: deleted here, delete not yet pushed. Hidden from every list. */
  deleted?: boolean;
  /** Asked to share with a crew but the server refused (crew sharing not live, or not a member). */
  shareFailed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PlanDraft = Pick<Plan, 'place' | 'date' | 'species' | 'notes' | 'reminder' | 'crew'>;

// --- reminders: pluggable because expo-notifications is not in this build (no new native modules).
export type ReminderScheduler = (plan: Plan) => Promise<boolean>;
let scheduler: ReminderScheduler = async () => false;
export const setReminderScheduler = (s: ReminderScheduler) => {
  scheduler = s;
};

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
export function onPlansChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const accountOf = (p: Plan) => p.account ?? p.owner;
const raw = () => readJson<Plan[]>(PLANS_KEY, []);
const all = async () => (await raw()).filter((p) => !p.deleted);

// The app registers one syncer (data/hooks); any change kicks it so new plans upload right away.
let kick: () => void = () => {};
export const setPlansSyncKick = (k: () => void) => {
  kick = k;
};

export async function listPlans(owner: string): Promise<Plan[]> {
  return (await all()).filter((p) => accountOf(p) === owner).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** Upcoming = today or later (plans move to Past the day after their date). */
export function splitPlans(plans: Plan[], today = todayET()) {
  return {
    upcoming: plans.filter((p) => p.date >= today),
    past: plans.filter((p) => p.date < today).reverse(),
  };
}

export async function getPlan(id: string): Promise<Plan | null> {
  return (await all()).find((p) => p.id === id) ?? null;
}

const clean = (d: PlanDraft): PlanDraft => ({ ...d, notes: d.notes.trim().slice(0, 500) });

export async function savePlan(owner: string, draft: PlanDraft, now = new Date()): Promise<Plan> {
  const iso = now.toISOString();
  const plan: Plan = {
    ...clean(draft),
    id: newClientId(),
    owner,
    reminderScheduled: false,
    sync: flags.plans ? 'pending' : 'local',
    createdAt: iso,
    updatedAt: iso,
  };
  plan.reminderScheduled = plan.reminder !== 'none' && (await scheduler(plan).catch(() => false));
  await updateJson<Plan[]>(PLANS_KEY, [], (list) => [...list, plan]);
  changed();
  kick();
  return plan;
}

export async function updatePlan(id: string, patch: Partial<PlanDraft>, now = new Date()): Promise<Plan | null> {
  let out: Plan | null = null;
  await updateJson<Plan[]>(PLANS_KEY, [], (list) =>
    list.map((p) => {
      if (p.id !== id || p.readOnly) return p;
      out = { ...p, ...patch, shareFailed: false, notes: (patch.notes ?? p.notes).trim().slice(0, 500), updatedAt: now.toISOString(), sync: flags.plans ? 'pending' : p.sync };
      return out;
    }),
  );
  const next = out as Plan | null;
  if (next && 'reminder' in patch) {
    const scheduled = next.reminder !== 'none' && (await scheduler(next).catch(() => false));
    await updateJson<Plan[]>(PLANS_KEY, [], (list) => list.map((p) => (p.id === id ? { ...p, reminderScheduled: scheduled } : p)));
    next.reminderScheduled = scheduled;
  }
  changed();
  kick();
  return next;
}

/** Deletes now on the phone; a plan that may be on the server keeps a tombstone until the delete is pushed. */
export async function deletePlan(id: string, now = new Date()) {
  await updateJson<Plan[]>(PLANS_KEY, [], (list) =>
    list.flatMap((p) => {
      if (p.id !== id) return [p];
      if (p.readOnly) return [p];
      if (!flags.plans) return [];
      return [{ ...p, deleted: true, sync: 'pending' as const, updatedAt: now.toISOString() }];
    }),
  );
  changed();
  kick();
}

const toUpload = (p: Plan): PlanUpload => ({
  clientId: p.id,
  placeId: p.place.id,
  placeName: p.place.name,
  planDate: p.date,
  species: p.species,
  notes: p.notes,
  reminder: p.reminder,
  crewId: p.crew?.id ?? null,
});

export interface PlansSyncReport {
  pushed: number;
  failed: number;
}

// Push and pull never overlap: a push landing between a pull's fetch and merge would look "deleted on server".
let lock: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

let inFlight: Promise<PlansSyncReport> | null = null;
/** Push this owner's queued plans (one run at a time). Failures stay queued for the next trigger. */
export function syncPlans(backend: Backend, owner: string): Promise<PlansSyncReport> {
  inFlight ??= serial(() => runSync(backend, owner)).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(backend: Backend, owner: string): Promise<PlansSyncReport> {
  const report = { pushed: 0, failed: 0 };
  if (!flags.plans) return report;
  // Plans saved while sync was off ('local') join the queue too.
  const queue = (await raw()).filter((p) => accountOf(p) === owner && !p.readOnly && p.sync !== 'synced');
  for (const p of queue) {
    try {
      if (p.deleted) {
        await backend.deletePlan(p.id);
        await updateJson<Plan[]>(PLANS_KEY, [], (list) => list.filter((x) => !(x.id === p.id && x.updatedAt === p.updatedAt)));
      } else {
        const { shared } = await backend.upsertPlan(toUpload(p));
        // Only mark synced if it wasn't edited mid-push; otherwise the next run sends the newer copy.
        await updateJson<Plan[]>(PLANS_KEY, [], (list) =>
          list.map((x) => (x.id === p.id && x.updatedAt === p.updatedAt ? { ...x, sync: 'synced' as const, shareFailed: !!p.crew && !shared } : x)),
        );
      }
      report.pushed++;
    } catch (e) {
      report.failed++;
      if (e instanceof NotSignedInError) break;
    }
  }
  if (report.pushed) changed();
  return report;
}

export interface PlansPullReport {
  added: number;
  updated: number;
  removed: number;
  /** Server rows whose spot isn't in the loaded places yet; picked up on a later pull. */
  unresolved: number;
}

/**
 * Pull the account's own plans plus crew-shared ones and merge by client_id:
 * - a local row with a pending change (edit, delete tombstone, unsynced) wins until it's pushed;
 * - a synced local row takes the server copy, or is removed when the server no longer has it;
 * - server rows unknown here are added (synced; read-only when someone else made them).
 * Throws on network/auth failure, leaving the local store untouched.
 */
export async function pullPlans(
  backend: Backend,
  account: string,
  resolvePlace: (id: string) => PlanPlace | null,
): Promise<PlansPullReport> {
  return serial(() => runPull(backend, account, resolvePlace));
}

async function runPull(backend: Backend, account: string, resolvePlace: (id: string) => PlanPlace | null): Promise<PlansPullReport> {
  const report: PlansPullReport = { added: 0, updated: 0, removed: 0, unresolved: 0 };
  if (!flags.plans) return report;
  const rows = await backend.listServerPlans();
  const byId = new Map(rows.map((r) => [r.clientId, r]));
  await updateJson<Plan[]>(PLANS_KEY, [], (list) => {
    const out: Plan[] = [];
    const seen = new Set<string>();
    for (const p of list) {
      if (accountOf(p) !== account) {
        out.push(p);
        continue;
      }
      seen.add(p.id);
      const r = byId.get(p.id);
      if (!p.readOnly && p.sync !== 'synced') {
        out.push(p); // pending local change wins
      } else if (!r) {
        report.removed++; // deleted or unshared on the server
      } else {
        const next = fromServer(r, account, p.place.id === r.placeId ? p.place : resolvePlace(r.placeId) ?? p.place, p);
        if (next.updatedAt !== p.updatedAt || next.crew?.name !== p.crew?.name) report.updated++;
        out.push(next);
      }
    }
    for (const r of rows) {
      if (seen.has(r.clientId)) continue;
      const place = resolvePlace(r.placeId);
      if (!place) {
        report.unresolved++;
        continue;
      }
      out.push(fromServer(r, account, place));
      report.added++;
    }
    return out;
  });
  if (report.added || report.updated || report.removed) changed();
  return report;
}

function fromServer(r: ServerPlan, account: string, place: PlanPlace, prev?: Plan): Plan {
  const mine = r.userId === account;
  return {
    id: r.clientId,
    owner: r.userId,
    ...(mine ? {} : { account, readOnly: true }),
    place: { ...place, name: r.placeName || place.name },
    date: r.planDate as Ymd,
    species: r.species as Species[],
    notes: r.notes,
    reminder: r.reminder,
    reminderScheduled: mine ? (prev?.reminderScheduled ?? false) : false,
    crew: r.crewId ? { id: r.crewId, name: r.crewName ?? prev?.crew?.name ?? 'crew' } : null,
    sync: 'synced',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Live list of the owner's plans (null while loading, [] when signed out). */
export function usePlans(owner: string | null | undefined): Plan[] | null {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (!owner) return setPlans([]);
      listPlans(owner).then((p) => live && setPlans(p));
    };
    load();
    const off = onPlansChange(load);
    return () => {
      live = false;
      off();
    };
  }, [owner]);
  return plans;
}

export const toPlanPlace = (p: PlanPlace): PlanPlace => ({
  id: p.id,
  name: p.name,
  type: p.type,
  access: p.access,
  center: p.center,
  species: p.species,
  parking: p.parking ?? null,
});

/** Place snapshot cache so pushed screens (hunt, plan) can open a spot by id, offline too. */
const placeCache = new Map<string, PlanPlace>();
export const rememberPlace = (p: PlanPlace) => {
  placeCache.set(p.id, { id: p.id, name: p.name, type: p.type, access: p.access, center: p.center, species: p.species, parking: p.parking ?? null });
};
export const cachedPlace = (id: string) => placeCache.get(id) ?? null;
