declare function require(name: 'fs'): {
  readdirSync(path: string): string[];
  readFileSync(path: string, enc: 'utf8'): string;
  statSync(path: string): { isDirectory(): boolean };
};
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = require('fs');
const join = (...parts: string[]) => parts.join('/');

import type { Session as AuthSession } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';

/** Every source file under a dir (tests excluded). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [p] : [];
  });
}

describe('no anonymous sign-in', () => {
  it('nothing in the app calls signInAnonymously or offers a guest account', () => {
    const offenders = sources(join(__dirname, '..')).filter((f) => /signInAnonymously|signInAsGuest|Continue as guest/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps Supabase anonymous sign-ins off in the project config', () => {
    const toml = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'config.toml'), 'utf8');
    expect(toml).toMatch(/^enable_anonymous_sign_ins = false$/m);
  });

  it('treats a stray anonymous Supabase session as signed out', async () => {
    const anon = { user: { id: 'anon', email: null, is_anonymous: true } } as unknown as AuthSession;
    const sb = {
      auth: { getSession: async () => ({ data: { session: anon } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    };
    const b = createSupabaseBackend(sb as never);
    expect(await b.getSession()).toBeNull();
    await expect(b.upsertHuntLogEntry({ clientId: 'x', baseVersion: null, species: null, caption: '', huntedOn: null, placeCounts: [] })).rejects.toThrow(/Sign in/);
  });
});
