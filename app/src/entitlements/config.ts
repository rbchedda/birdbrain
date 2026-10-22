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

export const PLACEHOLDER_PRICE_NOTE = 'Placeholder prices, not final.';
