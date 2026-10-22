/** Feature catalogue. Safety info is ALWAYS free and cannot be gated. */
export const SAFETY_FEATURES = ['boundaries', 'accessLabels', 'huntingHours', 'regs'] as const;
export const FREE_FEATURES = [
  ...SAFETY_FEATURES,
  'seasons',
  'guide',
  'diary',
  'crews',
  'feed',
  'stockingCurrentWeek',
] as const;
export const PREMIUM_FEATURES = [
  'stockingCalendar',
  'stockingAlerts',
  'unlimitedSavedSpots',
  'multiYearStats',
  'offlineMaps',
  'autoWeather',
  'export',
  'multiDog',
  'premiumRecap',
] as const;

export type SafetyFeature = (typeof SAFETY_FEATURES)[number];
export type FreeFeature = (typeof FREE_FEATURES)[number];
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];
export type Feature = FreeFeature | PremiumFeature;

// Compile-time guard: a safety feature can never also be premium.
type Overlap = Extract<SafetyFeature, PremiumFeature>;
const _noSafetyGated: [Overlap] extends [never] ? true : never = true;
void _noSafetyGated;

const safety = new Set<string>(SAFETY_FEATURES);
const premium = new Set<string>(PREMIUM_FEATURES);
export const isSafetyFeature = (f: string): f is SafetyFeature => safety.has(f);
/** True if the feature requires a pass. Safety features always return false. */
export const isPremium = (f: Feature): boolean => !isSafetyFeature(f) && premium.has(f);

/** Free-tier cap on saved spots (unlimited with a pass). */
export const FREE_SAVED_SPOT_LIMIT = 5;
