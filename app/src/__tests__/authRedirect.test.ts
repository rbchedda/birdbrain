import * as Linking from 'expo-linking';

jest.mock('expo-linking', () => ({ createURL: jest.fn((p: string) => `birdbrain://${p.replace(/^\//, '')}`) }));

import { createSupabaseBackend } from '@/data/supabaseBackend';
import { authRedirectMessage, authRedirectUrl, parseAuthRedirect } from '@/lib/authRedirect';

function fakeSb() {
  const auth = {
    signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
    exchangeCodeForSession: jest.fn(async () => ({ data: {}, error: null })),
    setSession: jest.fn(async () => ({ data: {}, error: null })),
    getSession: jest.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
  };
  return { auth } as never as Parameters<typeof createSupabaseBackend>[0] & { auth: typeof auth };
}

describe('email confirmation redirect', () => {
  it('signUp passes emailRedirectTo = Linking.createURL(/auth/callback)', async () => {
    const sb = fakeSb();
    const r = await createSupabaseBackend(sb).signUp('a@example.test', 'pw123456');
    expect(r.needsConfirmation).toBe(true);
    expect(sb.auth.signUp).toHaveBeenCalledWith({
      email: 'a@example.test',
      password: 'pw123456',
      options: { emailRedirectTo: Linking.createURL('/auth/callback') },
    });
    expect(authRedirectUrl()).toBe('birdbrain://auth/callback');
    expect(Linking.createURL).toHaveBeenCalledWith('/auth/callback');
  });

  it('completeAuthRedirect uses the PKCE code, else the tokens, else throws', async () => {
    const sb = fakeSb();
    const b = createSupabaseBackend(sb);
    await b.completeAuthRedirect({ code: 'c1' });
    expect(sb.auth.exchangeCodeForSession).toHaveBeenCalledWith('c1');
    await b.completeAuthRedirect({ accessToken: 'a', refreshToken: 'r' });
    expect(sb.auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    await expect(b.completeAuthRedirect({})).rejects.toThrow();
  });

  it('parses query and #fragment params, ignoring malformed ones', () => {
    expect(parseAuthRedirect('birdbrain://auth/callback?code=x')).toMatchObject({ code: 'x' });
    expect(parseAuthRedirect('exp://h/--/auth/callback#access_token=a&refresh_token=r&type=signup')).toMatchObject({
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(parseAuthRedirect('birdbrain://auth/callback#error=access_denied&error_code=otp_expired&bad=%E0%A4%A')).toMatchObject({
      error: 'access_denied',
      errorCode: 'otp_expired',
    });
    expect(parseAuthRedirect(null, { code: ['q'] })).toMatchObject({ code: 'q' });
  });

  it('maps errors to friendly copy that keeps hunts in mind', () => {
    expect(authRedirectMessage({ errorCode: 'otp_expired' })).toMatch(/expired/);
    expect(authRedirectMessage(new Error('User already registered'))).toMatch(/already confirmed/);
    expect(authRedirectMessage(new Error('weird'))).toMatch(/couldn’t finish/);
    for (const m of [authRedirectMessage({}), authRedirectMessage({ errorCode: 'otp_expired' })]) expect(m).toMatch(/hunts are still saved/);
  });
});
