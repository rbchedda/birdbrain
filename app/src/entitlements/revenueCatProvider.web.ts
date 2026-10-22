/**
 * Web stub: Metro resolves this instead of revenueCatProvider.ts for web, so
 * react-native-purchases / @revenuecat/purchases-js never enter the web bundle.
 * Web has no store purchases; createPurchaseProvider falls back.
 */
import type { PurchaseProvider } from './provider';

export function createRevenueCatProvider(): PurchaseProvider {
  throw new Error('RevenueCat is not available on web');
}
