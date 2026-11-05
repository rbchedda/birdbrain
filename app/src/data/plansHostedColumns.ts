import { flags } from '@/lib/flags';

import type { PlanUpload } from './backend';

/**
 * Hosted `public.plans` column list for select / upsert.
 * With EXPO_PUBLIC_FLAG_CREW_SPOT_VERDICT off, matches origin/dev exactly so
 * fieldtest against hosted (pre-migration) does not 400 on unknown columns.
 */

/** Exact select string on origin/dev today (no crew-verdict columns). */
export const PLANS_SELECT_BASE =
  'user_id, client_id, place_id, place_name, plan_date, species, notes, reminder, crew_id, created_at, updated_at';

export const PLANS_SELECT_WITH_CREW_VERDICT =
  'user_id, client_id, place_id, place_name, plan_date, species, notes, reminder, crew_id, show_spot_verdict_to_crew, spot_verdict_snapshot, created_at, updated_at';

export const CREW_VERDICT_COLUMN_NAMES = [
  'show_spot_verdict_to_crew',
  'spot_verdict_snapshot',
] as const;

export function plansSelectColumns(): string {
  return flags.crewSpotVerdict ? PLANS_SELECT_WITH_CREW_VERDICT : PLANS_SELECT_BASE;
}

/** Keys written on plans upsert/update (excludes user_id, client_id, crew_id). */
export function planUpsertColumnKeys(): string[] {
  const base = ['place_id', 'place_name', 'plan_date', 'species', 'notes', 'reminder'];
  return flags.crewSpotVerdict ? [...base, ...CREW_VERDICT_COLUMN_NAMES] : base;
}

export function planUpsertCols(p: PlanUpload): Record<string, unknown> {
  const cols: Record<string, unknown> = {
    place_id: p.placeId,
    place_name: p.placeName.slice(0, 200),
    plan_date: p.planDate,
    species: p.species.slice(0, 20),
    notes: p.notes ? p.notes.slice(0, 500) : null,
    reminder: p.reminder,
  };
  if (flags.crewSpotVerdict) {
    cols.show_spot_verdict_to_crew = p.showSpotVerdictToCrew === true;
    cols.spot_verdict_snapshot = p.showSpotVerdictToCrew ? p.spotVerdictSnapshot : null;
  }
  return cols;
}
