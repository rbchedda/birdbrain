/**
 * Public client config, inlined by Expo from EXPO_PUBLIC_* variables (see the
 * repo's .env.example). When either is missing the app runs on sample data.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  /**
   * Public origin that serves web/share/ (no trailing slash). Used to build
   * diary share links. Empty until hosting is configured — Share still mints a
   * token but the copied URL is a path-only placeholder.
   */
  shareBaseUrl: (process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? '').replace(/\/$/, ''),
};

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseKey);

/**
 * Sample data is opt-in: only with EXPO_PUBLIC_USE_SAMPLE_DATA=1 (a dev flag) or
 * under jest. A build without Supabase config and without the flag gets an
 * "unconfigured" backend that fails loudly instead of showing fake data.
 */
export const useSampleData =
  process.env.EXPO_PUBLIC_USE_SAMPLE_DATA === '1' || process.env.NODE_ENV === 'test';

/**
 * Launch links: privacy policy, terms, support and map-error reporting.
 * ONE config spot: each comes from an EXPO_PUBLIC_* variable (set it as an EAS
 * env var for production builds, or in app/.env locally). Until a real page is
 * published the fallback is an obvious placeholder on the reserved `.invalid`
 * TLD carrying the TODO_PUBLISH marker, which never resolves and is easy to grep.
 * app.config.ts warns at build time while any of them is still a placeholder.
 * What to publish, and where: docs/launch/publish-checklist.md.
 */
export const TODO_PUBLISH = 'TODO_PUBLISH';
const PLACEHOLDER = `https://birdbrain.invalid/${TODO_PUBLISH}`;
const or = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const legal = {
  // Getters so tests can flip the env; Expo still inlines each EXPO_PUBLIC_* at build time.
  get privacyPolicyUrl() {
    return or(process.env.EXPO_PUBLIC_PRIVACY_URL, `${PLACEHOLDER}/privacy`);
  },
  get termsUrl() {
    return or(process.env.EXPO_PUBLIC_TERMS_URL, `${PLACEHOLDER}/terms`);
  },
  /** Support page (also the App Store Connect "Support URL"). */
  get supportUrl() {
    return or(process.env.EXPO_PUBLIC_SUPPORT_URL, `${PLACEHOLDER}/support`);
  },
  /** Support inbox shown in Settings → Help. */
  get supportEmail() {
    return or(process.env.EXPO_PUBLIC_SUPPORT_EMAIL, `${TODO_PUBLISH}@birdbrain.invalid`);
  },
  /** Map data error report: an https form URL (gets ?place=<id>&name=<name>) or a mailto: address. */
  get mapErrorReportUrl() {
    return or(process.env.EXPO_PUBLIC_MAP_ERROR_URL, `${PLACEHOLDER}/map-error`);
  },
};

export type LaunchLink = 'privacyPolicyUrl' | 'termsUrl' | 'supportUrl' | 'supportEmail' | 'mapErrorReportUrl';
export const LAUNCH_LINKS: readonly LaunchLink[] = ['privacyPolicyUrl', 'termsUrl', 'supportUrl', 'supportEmail', 'mapErrorReportUrl'];

export const isPlaceholderLink = (value: string): boolean => value.includes(TODO_PUBLISH);
/** Launch links still on their placeholder; must be empty before store submission. */
export const unpublishedLinks = (): LaunchLink[] => LAUNCH_LINKS.filter((k) => isPlaceholderLink(legal[k]));

/** Where "Contact support" goes: the support page, else a mail to the support inbox. */
export function supportLink(): string {
  if (!isPlaceholderLink(legal.supportUrl)) return legal.supportUrl;
  if (!isPlaceholderLink(legal.supportEmail)) return `mailto:${legal.supportEmail}?subject=${encodeURIComponent('BirdBrain support')}`;
  return legal.supportUrl;
}

/** "Report a map error" link for one place, for either a form URL or a mailto: address. */
export function mapErrorReportLink(place: { id: string; name: string }): string {
  const base = legal.mapErrorReportUrl;
  if (base.startsWith('mailto:')) {
    const subject = encodeURIComponent(`BirdBrain map error: ${place.name}`);
    const body = encodeURIComponent(`Place: ${place.name} (${place.id})\n\nWhat looks wrong:\n`);
    return `${base}${base.includes('?') ? '&' : '?'}subject=${subject}&body=${body}`;
  }
  return `${base}${base.includes('?') ? '&' : '?'}place=${encodeURIComponent(place.id)}&name=${encodeURIComponent(place.name)}`;
}

/** Minimum age to use BirdBrain (COPPA / store policy). */
export const MIN_AGE = 13;
