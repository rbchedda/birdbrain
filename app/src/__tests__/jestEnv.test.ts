// jest.env.js strips hosted backend keys so a developer's shell can't change test results.
it('tests never see EXPO_PUBLIC_SUPABASE_* from the shell', () => {
  expect(Object.keys(process.env).filter((k) => k.startsWith('EXPO_PUBLIC_SUPABASE_'))).toEqual([]);
  expect(require('@/lib/env').env.supabaseUrl).toBe('');
});
