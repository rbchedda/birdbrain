// Tests must never see a developer's hosted backend. Runs before any module loads,
// so shell or .env values for these keys can't switch tests onto Supabase.
// Tests that need them set process.env themselves (see env.test.ts).
for (const key of Object.keys(process.env)) {
  if (key.startsWith('EXPO_PUBLIC_SUPABASE_')) delete process.env[key];
}
