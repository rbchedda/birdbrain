import { ENTITLEMENT_ID } from './config';
import { isPremium, isSafetyFeature, type Feature } from './features';

export interface EntitlementState {
  /** Active entitlement ids, e.g. 'season_pass'. */
  active: string[];
  /** Expiry (ms epoch) of a non-renewing Weekend Pass, if any. */
  weekendPassExpiresAt?: number | null;
  /** Expiry of the subscription, if known (null = no expiry info / lifetime). */
  seasonPassExpiresAt?: number | null;
}

export const FREE_STATE: EntitlementState = { active: [] };

export function hasPremium(s: EntitlementState, now: number = Date.now()): boolean {
  if (s.active.includes(ENTITLEMENT_ID) && (s.seasonPassExpiresAt == null || s.seasonPassExpiresAt > now)) return true;
  return s.weekendPassExpiresAt != null && s.weekendPassExpiresAt > now;
}

/** The one gating check. Safety features are always usable. */
export function canUse(feature: Feature, s: EntitlementState, now: number = Date.now()): boolean {
  if (isSafetyFeature(feature)) return true;
  if (!isPremium(feature)) return true;
  // Field-test builds only (EXPO_PUBLIC_FIELDTEST_UNLOCK=1): every premium feature unlocked client-side.
  if (process.env.EXPO_PUBLIC_FIELDTEST_UNLOCK === '1') return true;
  return hasPremium(s, now);
}
