describe('Supabase wiring', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses Supabase when EXPO_PUBLIC_SUPABASE_URL and ANON_KEY are set', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    let data: typeof import('@/data') | undefined;
    jest.isolateModules(() => {
      data = require('@/data');
    });
    expect(data!.backend.mode).toBe('supabase');
    // No stored session yet: screens show the sign-in prompt instead of failing.
    expect(await data!.backend.getSession()).toBeNull();
  });

  it('falls back to sample data when either variable is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    let data: typeof import('@/data') | undefined;
    jest.isolateModules(() => {
      data = require('@/data');
    });
    expect(data!.backend.mode).toBe('sample');
  });
});
