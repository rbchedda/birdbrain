import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { productionViolations } from './check-eas-production.mjs';

test('real eas.json is clean', () => {
  assert.deepEqual(productionViolations(JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'))), []);
});
test('flags the unlock on production or anything it extends', () => {
  const eas = { build: { base: { env: { EXPO_PUBLIC_FIELDTEST_UNLOCK: '1' } }, production: { extends: 'base' } } };
  assert.deepEqual(productionViolations(eas), ['build.base.env.EXPO_PUBLIC_FIELDTEST_UNLOCK']);
  assert.deepEqual(productionViolations({ build: { production: { env: { EXPO_PUBLIC_FIELDTEST_UNLOCK: '0' } } } }), ['build.production.env.EXPO_PUBLIC_FIELDTEST_UNLOCK']);
  assert.deepEqual(productionViolations({ build: { preview: { env: { EXPO_PUBLIC_FIELDTEST_UNLOCK: '1' } }, production: {} } }), []);
});
