/**
 * Deploy-time config for the static diary share viewer.
 * Copy to config.js on the host and fill in the public Supabase values.
 * Do NOT commit real keys; config.js is gitignored if present.
 */
window.BIRDBRAIN_SHARE = {
  // Project URL, e.g. https://xxxx.supabase.co
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  // Public anon / publishable key only (never the service role).
  supabaseAnonKey: 'YOUR_ANON_KEY',
  // Footer links (https only). Same pages as the app's EXPO_PUBLIC_* launch links;
  // see docs/launch/publish-checklist.md. TODO_PUBLISH values are ignored.
  appUrl: 'https://birdbrain.invalid/TODO_PUBLISH/app',
  privacyUrl: 'https://birdbrain.invalid/TODO_PUBLISH/privacy',
  termsUrl: 'https://birdbrain.invalid/TODO_PUBLISH/terms',
};
