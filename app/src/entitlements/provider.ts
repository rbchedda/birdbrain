import { PRODUCTS, type ProductConfig } from './config';
import type { EntitlementState } from './state';

export interface PurchaseProvider {
  readonly name: 'mock' | 'revenuecat' | 'unavailable';
  getEntitlements(): Promise<EntitlementState>;
  purchase(productId: ProductConfig['id']): Promise<EntitlementState>;
  restore(): Promise<EntitlementState>;
}

/** Dev/mock provider: in-memory, no real money. Default everywhere. */
export class MockPurchaseProvider implements PurchaseProvider {
  readonly name = 'mock' as const;
  private state: EntitlementState = { active: [] };
  constructor(private clock: () => number = Date.now) {}
  async getEntitlements() {
    return { ...this.state, active: [...this.state.active] };
  }
  async purchase(productId: ProductConfig['id']) {
    const p = PRODUCTS[productId];
    if (p.kind === 'non_renewing') {
      this.state.weekendPassExpiresAt = this.clock() + (p.durationHours ?? 72) * 3600_000;
    } else {
      this.state.active = Array.from(new Set([...this.state.active, 'season_pass']));
      this.state.seasonPassExpiresAt = this.clock() + 365 * 24 * 3600_000;
    }
    return this.getEntitlements();
  }
  async restore() {
    return this.getEntitlements();
  }
}

/**
 * Release builds with no working store: premium stays locked, buy buttons are hidden.
 * Never grants anything.
 */
export class UnavailablePurchaseProvider implements PurchaseProvider {
  readonly name = 'unavailable' as const;
  async getEntitlements() {
    return { active: [] };
  }
  async purchase(): Promise<never> {
    throw new Error('Passes are not available yet.');
  }
  async restore() {
    return { active: [] };
  }
}

declare const __DEV__: boolean | undefined;
const isDevBuild = () => typeof __DEV__ !== 'undefined' && __DEV__ === true;

export type ProviderFlag = 'mock' | 'revenuecat';
export function providerFlag(raw: string | undefined = process.env.EXPO_PUBLIC_PURCHASES_PROVIDER): ProviderFlag {
  return raw?.trim().toLowerCase() === 'revenuecat' ? 'revenuecat' : 'mock';
}

/**
 * Picks the provider. RevenueCat is only loaded (lazy require) when the flag is
 * on AND the native module is available (EAS dev build). The mock store is
 * allowed ONLY in dev builds (__DEV__); a release build without a working
 * RevenueCat gets UnavailablePurchaseProvider (premium locked, no buy buttons).
 */
export function createPurchaseProvider(
  opts: { flag?: string; loadRevenueCat?: () => PurchaseProvider; isDev?: boolean } = {},
): PurchaseProvider {
  const dev = opts.isDev ?? isDevBuild();
  const fallback = (): PurchaseProvider => (dev ? new MockPurchaseProvider() : new UnavailablePurchaseProvider());
  if (providerFlag(opts.flag ?? process.env.EXPO_PUBLIC_PURCHASES_PROVIDER) !== 'revenuecat') return fallback();
  try {
    const load =
      opts.loadRevenueCat ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (() => (require('./revenueCatProvider') as typeof import('./revenueCatProvider')).createRevenueCatProvider());
    return load();
  } catch (e) {
    console.warn('[purchases] RevenueCat unavailable', e);
    return fallback();
  }
}
