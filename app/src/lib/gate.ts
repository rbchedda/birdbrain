import type { Session } from '@/data/backend';

/**
 * Hybrid guest mode: browsing (Map, SGLs, stocking, access labels/warnings,
 * Guide, hours, regs) needs no account. These actions do.
 */
export type AccountAction = 'saveHuntLog' | 'saveSpot' | 'crews' | 'feed' | 'purchase';

export const accountActions: readonly AccountAction[] = ['saveHuntLog', 'saveSpot', 'crews', 'feed', 'purchase'];

/** Optional paywall check. INTEGRATION POINT: pass dev-2's canUse (PR #24) once it merges. */
export type CanUse = (feature: string) => boolean;

export interface GateResult {
  allowed: boolean;
  /** Why not: needs an account (show the sign-in sheet) or a pass (show the paywall). */
  reason: 'signIn' | 'paywall' | null;
}

/**
 * Can this user do this action now? Account first, then (if a paywall check
 * is supplied) entitlement. Buying any pass, the Weekend Pass included,
 * requires an account so it can be restored on a new phone.
 */
export function gate(action: AccountAction, session: Session | null | undefined, opts: { canUse?: CanUse; feature?: string } = {}): GateResult {
  // A guest (anonymous) session never counts as an account.
  if (!session || session.anonymous) return { allowed: false, reason: 'signIn' };
  if (opts.canUse && opts.feature && !opts.canUse(opts.feature)) return { allowed: false, reason: 'paywall' };
  return { allowed: true, reason: null };
}

export const needsAccount = (action: AccountAction, session: Session | null | undefined) => gate(action, session).reason === 'signIn';
