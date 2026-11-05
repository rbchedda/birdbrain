/**
 * Wind layer default for people who have never touched the switch.
 * Spec (wind-forecast) says off; RBChedda hasn't decided yet, so this is the ONE place to flip it.
 */
export const WIND_DEFAULT_ON = false;

/** The switch's remembered choice (like birdbrain.basemap.v1). */
export const WIND_PREF_KEY = 'birdbrain.wind.v1';

/** Forecast age thresholds (spec 04). */
export const FRESH_MS = 6 * 3600_000;
export const EXPIRED_MS = 24 * 3600_000;
/** Hour stepper range: now through +48 h. */
export const WIND_MAX_HOURS = 48;
