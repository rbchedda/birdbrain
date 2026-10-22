import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { backend } from '@/data';
import { gate } from '@/lib/gate';

import type { ProductConfig } from './config';
import type { Feature } from './features';
import { createPurchaseProvider, type PurchaseProvider } from './provider';
import { canUse as canUseFor, FREE_STATE, hasPremium, type EntitlementState } from './state';

interface Ctx {
  state: EntitlementState;
  provider: PurchaseProvider;
  canUse: (f: Feature) => boolean;
  premium: boolean;
  purchase: (id: ProductConfig['id']) => Promise<void>;
  restore: () => Promise<void>;
  upgradeFor: Feature | null;
  showUpgrade: (f: Feature | null) => void;
}

export class AccountRequiredError extends Error {
  constructor() {
    super('Sign in to buy or restore a pass, so it stays with your account if you switch phones.');
    this.name = 'AccountRequiredError';
  }
}

const defaultProvider = createPurchaseProvider();
const EntitlementsCtx = createContext<Ctx | null>(null);

export function EntitlementsProvider({
  children,
  provider = defaultProvider,
  initialState = FREE_STATE,
  now,
}: {
  children: ReactNode;
  provider?: PurchaseProvider;
  initialState?: EntitlementState;
  now?: () => number;
}) {
  const [state, setState] = useState(initialState);
  const [upgradeFor, showUpgrade] = useState<Feature | null>(null);
  useEffect(() => {
    provider.getEntitlements().then((s) => s.active.length || s.weekendPassExpiresAt ? setState(s) : undefined).catch(() => {});
  }, [provider]);
  const clock = now ?? Date.now;
  // Hybrid guest mode: buying or restoring any pass (Weekend Pass included) needs an account,
  // so a non-renewing pass can be restored on a new phone (RevenueCat custom App User ID).
  const requireAccount = useCallback(async () => {
    const session = await backend.getSession().catch(() => null);
    if (gate('purchase', session).reason === 'signIn') throw new AccountRequiredError();
  }, []);
  const purchase = useCallback(async (id: ProductConfig['id']) => {
    await requireAccount();
    setState(await provider.purchase(id));
  }, [provider, requireAccount]);
  const restore = useCallback(async () => {
    await requireAccount();
    setState(await provider.restore());
  }, [provider, requireAccount]);
  const value = useMemo<Ctx>(
    () => ({
      state,
      provider,
      canUse: (f) => canUseFor(f, state, clock()),
      premium: hasPremium(state, clock()),
      purchase,
      restore,
      upgradeFor,
      showUpgrade,
    }),
    [state, provider, clock, purchase, restore, upgradeFor],
  );
  return <EntitlementsCtx.Provider value={value}>{children}</EntitlementsCtx.Provider>;
}

const fallback: Ctx = {
  state: FREE_STATE,
  provider: defaultProvider,
  canUse: (f) => canUseFor(f, FREE_STATE),
  premium: false,
  purchase: async () => {},
  restore: async () => {},
  upgradeFor: null,
  showUpgrade: () => {},
};
/** Outside a provider (e.g. isolated tests) everything behaves as the free tier. */
export const useEntitlements = () => useContext(EntitlementsCtx) ?? fallback;
