/**
 * The Supabase service-role / secret key bypasses RLS and must never ship in
 * the app. This scans every text file under app/ (source, tests, config,
 * eas.json, .env*) for:
 *   - the words service_role / service-role / SERVICE_ROLE (any case),
 *   - new-style secret keys (sb_secret_…),
 *   - JWTs whose decoded payload has role "service_role".
 * No line-level exemptions. Only this file is allowlisted (it has to name what it hunts for).
 */
const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const APP = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.expo', 'dist', 'ios', 'android', '.git', 'web-build']);
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|html|ya?ml|toml|plist|xml)$|^\.env/;
const ALLOW = new Set([path.relative(APP, __filename)]);

const ROLE_WORD = /service[_-]?role/i;
const SECRET_KEY = new RegExp('sb' + '_secret_[A-Za-z0-9_-]{8,}');
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;

function jwtRole(payload: string): unknown {
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

/** Every leak in a piece of text, as "line: kind". */
export function findLeaks(text: string): string[] {
  const out: string[] = [];
  text.split('\n').forEach((line, i) => {
    if (ROLE_WORD.test(line)) out.push(`${i + 1}: service_role`);
    if (SECRET_KEY.test(line)) out.push(`${i + 1}: sb_secret`);
    for (const m of line.matchAll(JWT)) if (jwtRole(m[1]) === 'service_role') out.push(`${i + 1}: service_role JWT`);
  });
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.test(name) && name !== 'package-lock.json') out.push(p);
  }
  return out;
}

export function scan(root: string, allow: Set<string> = new Set()): string[] {
  return walk(root)
    .filter((f) => !allow.has(path.relative(root, f)))
    .flatMap((f) => findLeaks(fs.readFileSync(f, 'utf8')).map((l) => `${path.relative(root, f)}:${l}`));
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.c2lnbmF0dXJl`;

test('nothing under app/ references a service-role or secret key', () => {
  expect(scan(APP, ALLOW)).toEqual([]);
});

describe('detections (planted cases)', () => {
  it('catches the role name in code and in comments, including "never" comments', () => {
    expect(findLeaks("const k = process.env.SUPABASE_SERVICE_ROLE_KEY; // never")).toEqual(['1: service_role']);
    expect(findLeaks('# never put the service_role key here')).toEqual(['1: service_role']);
    expect(findLeaks("headers['x-service-role'] = k")).toEqual(['1: service_role']);
  });
  it('catches sb_secret_ keys', () => {
    expect(findLeaks(`EXPO_PUBLIC_SUPABASE_KEY=${'sb' + '_secret_'}AbC123xyz_9876543210`)).toEqual(['1: sb_secret']);
    expect(findLeaks('EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_AbC123xyz_9876543210')).toEqual([]);
  });
  it('catches a JWT whose payload role is service_role, not an anon JWT', () => {
    expect(findLeaks(`key: '${jwt('service_role')}'`)).toEqual(['1: service_role JWT']);
    expect(findLeaks(`key: '${jwt('anon')}'`)).toEqual([]);
  });
  it('finds planted files on disk, including .env and tests; the allowlist is per file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-'));
    fs.mkdirSync(path.join(dir, 'src', '__tests__'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.env'), `EXPO_PUBLIC_SUPABASE_ANON_KEY=${jwt('service_role')}\n`);
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), `export const k = '${'sb' + '_secret_'}zzzzzzzzzzzz';\n`);
    fs.writeFileSync(path.join(dir, 'src', '__tests__', 'b.test.ts'), '// service_role\n');
    fs.writeFileSync(path.join(dir, 'src', 'ok.ts'), `export const anon = '${jwt('anon')}';\n`);
    expect(scan(dir).sort()).toEqual(['.env:1: service_role JWT', 'src/__tests__/b.test.ts:1: service_role', 'src/a.ts:1: sb_secret']);
    expect(scan(dir, new Set(['src/__tests__/b.test.ts'])).sort()).toEqual(['.env:1: service_role JWT', 'src/a.ts:1: sb_secret']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('eas.json profiles carry only EXPO_PUBLIC_ env', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(APP, 'eas.json'), 'utf8'));
  for (const [name, p] of Object.entries<any>(eas.build)) {
    for (const k of Object.keys(p.env ?? {})) expect([name, k]).toEqual([name, expect.stringMatching(/^EXPO_PUBLIC_/)]);
  }
});
