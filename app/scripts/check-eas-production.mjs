#!/usr/bin/env node
// CI guard (security M2): the field-test unlock turns every premium feature on
// client-side, so it must never be set for a production build. Walks the
// `extends` chain of build.production in eas.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = ['EXPO_PUBLIC_FIELDTEST_UNLOCK'];

export function productionViolations(eas) {
  const out = [];
  const seen = new Set();
  let name = 'production';
  while (name && !seen.has(name)) {
    seen.add(name);
    const p = eas?.build?.[name];
    if (!p) break;
    for (const k of FORBIDDEN) if (p.env && k in p.env) out.push(`build.${name}.env.${k}`);
    name = p.extends;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('../eas.json', import.meta.url);
  const bad = productionViolations(JSON.parse(readFileSync(file, 'utf8')));
  if (bad.length) {
    console.error(`eas.json: forbidden in the production profile: ${bad.join(', ')}`);
    process.exit(1);
  }
  console.log('eas.json production profile: OK (no field-test unlock)');
}
