import { PRODUCTS, type ProductConfig } from './config';
import type { EntitlementState } from './state';

export interface PurchaseProvider {
  readonly name: 'mock' | 'revenuecat';
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

export type ProviderFlag = 'mock' | 'revenuecat';
export function providerFlag(raw: string | undefined = process.env.EXPO_PUBLIC_PURCHASES_PROVIDER): ProviderFlag {
  return raw?.trim().toLowerCase() === 'revenuecat' ? 'revenuecat' : 'mock';
}

/**
 * Picks the provider. RevenueCat is only loaded (lazy require) when the flag is
 * on AND the native module is available (EAS dev build). Anything else, including
 * Expo Go or a load failure, falls back to the mock.
 */
export function createPurchaseProvider(
  opts: { flag?: string; loadRevenueCat?: () => PurchaseProvider } = {},
): PurchaseProvider {
  if (providerFlag(opts.flag ?? process.env.EXPO_PUBLIC_PURCHASES_PROVIDER) !== 'revenuecat') return new MockPurchaseProvider();
  try {
    const load =
      opts.loadRevenueCat ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (() => (require('./revenueCatProvider') as typeof import('./revenueCatProvider')).createRevenueCatProvider());
    return load();
  } catch (e) {
    console.warn('[purchases] RevenueCat unavailable, using mock provider', e);
    return new MockPurchaseProvider();
  }
}
