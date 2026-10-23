import { useEffect, useState } from 'react';

import type { AccessType } from '@/data/access';
import type { LngLat, PlaceType, Species } from '@/data/types';
import { flags } from '@/lib/flags';
import { newClientId, readJson, updateJson } from '@/lib/localStore';
import type { Reminder } from '@/lib/spotPlan';
import { todayET, type Ymd } from '@/lib/time';

/**
 * Hunt plans (spot-detail spec: Plan a hunt, Profile › Plans). LOCAL ONLY: a
 * hosted plans table is not approved, so plans live on this phone, keyed to
 * the signed-in account. EXPO_PUBLIC_FLAG_PLANS (off by default) only marks
 * new plans as waiting to sync; no server call exists in this build.
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
  owner: string;
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

const all = () => readJson<Plan[]>(PLANS_KEY, []);

export async function listPlans(owner: string): Promise<Plan[]> {
  return (await all()).filter((p) => p.owner === owner).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
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
  return plan;
}

export async function updatePlan(id: string, patch: Partial<PlanDraft>, now = new Date()): Promise<Plan | null> {
  let out: Plan | null = null;
  await updateJson<Plan[]>(PLANS_KEY, [], (list) =>
    list.map((p) => {
      if (p.id !== id) return p;
      out = { ...p, ...patch, notes: (patch.notes ?? p.notes).trim().slice(0, 500), updatedAt: now.toISOString(), sync: flags.plans ? 'pending' : p.sync };
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
  return next;
}

export async function deletePlan(id: string) {
  await updateJson<Plan[]>(PLANS_KEY, [], (list) => list.filter((p) => p.id !== id));
  changed();
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

/** Place snapshot cache so pushed screens (hunt, plan) can open a spot by id, offline too. */
const placeCache = new Map<string, PlanPlace>();
export const rememberPlace = (p: PlanPlace) => {
  placeCache.set(p.id, { id: p.id, name: p.name, type: p.type, access: p.access, center: p.center, species: p.species, parking: p.parking ?? null });
};
export const cachedPlace = (id: string) => placeCache.get(id) ?? null;
