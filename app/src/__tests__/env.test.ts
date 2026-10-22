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

  const load = () => {
    let data: typeof import('@/data') | undefined;
    jest.isolateModules(() => {
      data = require('@/data');
    });
    return data!;
  };
  const unsetSupabase = () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  };

  it('uses sample data without Supabase only under test or the dev flag', () => {
    unsetSupabase();
    expect(load().backend.mode).toBe('sample'); // NODE_ENV=test under jest
    process.env.NODE_ENV = 'development';
    process.env.EXPO_PUBLIC_USE_SAMPLE_DATA = '1';
    expect(load().backend.mode).toBe('sample');
  });

  it('does not fall back to sample data in an app build without config (Expo Go)', async () => {
    unsetSupabase();
    process.env.NODE_ENV = 'development';
    delete process.env.EXPO_PUBLIC_USE_SAMPLE_DATA;
    const { backend } = load();
    expect(backend.mode).toBe('unconfigured');
    expect(await backend.getSession()).toBeNull();
    await expect(backend.listPlaces()).rejects.toThrow(/not connected to a server/);
    await expect(backend.signIn('a@example.test', 'secret1')).rejects.toThrow(/app\/\.env/);
  });

  it('prefers Supabase over the sample flag when both are set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.EXPO_PUBLIC_USE_SAMPLE_DATA = '1';
    expect(load().backend.mode).toBe('supabase');
  });
});
