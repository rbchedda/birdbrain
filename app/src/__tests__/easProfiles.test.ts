/** Release builds never pick the mock purchase provider from eas.json. */
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'eas.json'), 'utf8'));

/** env a profile resolves to, following `extends`. */
function resolvedEnv(name: string): Record<string, string> {
  const p = eas.build[name];
  return { ...(p.extends ? resolvedEnv(p.extends) : {}), ...(p.env ?? {}) };
}

test('production leaves EXPO_PUBLIC_PURCHASES_PROVIDER unset (never mock)', () => {
  const env = resolvedEnv('production');
  expect(env.EXPO_PUBLIC_PURCHASES_PROVIDER).toBeUndefined();
  expect(JSON.stringify(eas.build.production)).not.toMatch(/mock/i);
});

test('production uses EAS remote versioning with autoIncrement', () => {
  expect(eas.cli.appVersionSource).toBe('remote');
  expect(eas.build.production.autoIncrement).toBe(true);
});
