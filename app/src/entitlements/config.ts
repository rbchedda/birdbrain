/**
 * THE single source of prices, product ids and offerings. Nothing else in the
 * app may hard-code a price or store product id.
 * Every price is a PLACEHOLDER (notFinal: true) until real store products exist.
 * BLOCKED: real App Store Connect / Play Console products and RevenueCat
 * offerings are not created yet (no Apple / RevenueCat accounts).
 */
export const ENTITLEMENT_ID = 'season_pass' as const;

export interface Price {
  amountUsd: number;
  display: string;
  notFinal: true;
}

export interface ProductConfig {
  id: 'season_pass_yearly' | 'weekend_pass';
  /** Store product id (placeholder until store products exist). */
  storeProductId: string;
  title: string;
  kind: 'auto_renewing_yearly' | 'non_renewing';
  price: Price;
  /** Optional intro offer (founding price for the first year). */
  introOffer?: { label: string; price: Price };
  /** Non-renewing passes only: how long premium lasts after purchase. */
  durationHours?: number;
}

export const RC_OFFERING_ID = 'default';

export const PRODUCTS: Record<ProductConfig['id'], ProductConfig> = {
  season_pass_yearly: {
    id: 'season_pass_yearly',
    storeProductId: 'birdbrain.season_pass.yearly.PLACEHOLDER',
    title: 'Season Pass',
    kind: 'auto_renewing_yearly',
    price: { amountUsd: 19.99, display: '$19.99/yr', notFinal: true },
    introOffer: { label: 'Founding price', price: { amountUsd: 9.99, display: '$9.99 first year', notFinal: true } },
  },
  weekend_pass: {
    id: 'weekend_pass',
    storeProductId: 'birdbrain.weekend_pass.PLACEHOLDER',
    title: 'Weekend Pass',
    kind: 'non_renewing',
    price: { amountUsd: 3.99, display: '$3.99', notFinal: true },
    durationHours: 72,
  },
};

/**
 * TODO(BLOCKED on RevenueCat account): when the provider is RevenueCat, show the
 * store's localized product.priceString instead of these config prices. Config
 * prices are the mock/dev fallback only.
 */
export const PLACEHOLDER_PRICE_NOTE = 'Placeholder prices, not final.';

/** Apple 3.1.2 disclosure copy. Prices come from PRODUCTS above. */
export const DISCLOSURE = {
  seasonAutoRenew: (price: string) =>
    `Season Pass is an auto-renewing yearly subscription at ${price}. Payment is charged to your Apple ID or Google Play account at confirmation. It renews automatically unless cancelled at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before the period ends. Manage or cancel in your App Store or Google Play account settings.`,
  introOffer: (intro: string, price: string) => `${intro} for new subscribers, then ${price} unless cancelled.`,
  weekendNonRenewing: (hours: number, price: string) =>
    `Weekend Pass is a one-time ${price} purchase for ${hours} hours of premium. It does not renew and is not a subscription.`,
} as const;
