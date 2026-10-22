/**
 * The Supabase service_role key bypasses RLS and must never ship in the app.
 * Lines warning against it ("never …") are allowed. Fails if anything under app/ (source, config, eas.json, .env*) references it.
 */
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const root = path.join(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.expo', 'dist', 'ios', 'android', '__tests__', '.git']);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$|^\.env/;
const BAD = /service[_-]?role|SERVICE_ROLE/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name) && !name.endsWith('lock.json')) out.push(p);
  }
  return out;
}

test('no service_role key or reference anywhere under app/', () => {
  const hits = walk(root).filter((f) => fs.readFileSync(f, 'utf8').split('\n').some((l) => BAD.test(l) && !/\bnever\b/i.test(l))).map((f) => path.relative(root, f));
  expect(hits).toEqual([]);
});

test('eas.json profiles carry no secret-looking env', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  for (const [name, p] of Object.entries<any>(eas.build)) {
    for (const k of Object.keys(p.env ?? {})) expect([name, k]).toEqual([name, expect.stringMatching(/^EXPO_PUBLIC_/)]);
  }
});
