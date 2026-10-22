/**
 * RevenueCat provider (react-native-purchases over Apple IAP / Google Play Billing).
 * Only ever required lazily from provider.ts when EXPO_PUBLIC_PURCHASES_PROVIDER=revenuecat.
 * Needs an EAS dev build; Expo Go has no native module.
 *
 * BLOCKED: no Apple developer / Play Console / RevenueCat accounts yet, so there
 * are no API keys, store products or offerings. Untested against a real store.
 * TODO(BLOCKED): set EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY, create
 * products matching config.ts, the 'season_pass' entitlement and the offering.
 */
import { Platform } from 'react-native';

import { ENTITLEMENT_ID, PRODUCTS, RC_OFFERING_ID, type ProductConfig } from './config';
import type { PurchaseProvider } from './provider';
import type { EntitlementState } from './state';

export function createRevenueCatProvider(): PurchaseProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Purchases = require('react-native-purchases').default;
  const apiKey =
    Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) throw new Error('RevenueCat API key missing (BLOCKED: no account yet)');
  Purchases.configure({ apiKey });

  const toState = (info: any): EntitlementState => {
    const ent = info?.entitlements?.active?.[ENTITLEMENT_ID];
    const weekend = (info?.nonSubscriptionTransactions ?? [])
      .filter((t: any) => t.productIdentifier === PRODUCTS.weekend_pass.storeProductId)
      .map((t: any) => Date.parse(t.purchaseDate) + (PRODUCTS.weekend_pass.durationHours ?? 72) * 3600_000)
      .sort((a: number, b: number) => b - a)[0];
    return {
      active: ent ? [ENTITLEMENT_ID] : [],
      seasonPassExpiresAt: ent?.expirationDate ? Date.parse(ent.expirationDate) : null,
      weekendPassExpiresAt: weekend ?? null,
    };
  };

  return {
    name: 'revenuecat',
    async getEntitlements() {
      return toState(await Purchases.getCustomerInfo());
    },
    async purchase(productId: ProductConfig['id']) {
      const offerings = await Purchases.getOfferings();
      const offering = offerings.all?.[RC_OFFERING_ID] ?? offerings.current;
      const pkg = offering?.availablePackages?.find(
        (p: any) => p.product?.identifier === PRODUCTS[productId].storeProductId,
      );
      if (!pkg) throw new Error(`No RevenueCat package for ${productId}`);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return toState(customerInfo);
    },
    async restore() {
      return toState(await Purchases.restorePurchases());
    },
  };
}
