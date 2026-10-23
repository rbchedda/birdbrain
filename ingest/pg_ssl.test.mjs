import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import pg from 'pg';

import { pgClientConfig, SUPABASE_CA_PATH } from './arcgis.mjs';

// Fake URLs and a fake CA only; nothing here connects anywhere.
const CA = '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----\n';
const BASE = 'postgresql://postgres.fakeref:p%40ss%26word@aws-0-us-east-1.pooler.example.test:6543/postgres';

describe('pgClientConfig', () => {
  it('sets the CA and rejectUnauthorized: true', () => {
    const c = pgClientConfig(BASE, CA);
    assert.deepEqual(c.ssl, { ca: CA, rejectUnauthorized: true });
  });

  it('leaves a URL without query params unchanged', () => {
    assert.equal(pgClientConfig(BASE, CA).connectionString, BASE);
  });

  it('strips sslmode', () => {
    assert.equal(pgClientConfig(`${BASE}?sslmode=require`, CA).connectionString, BASE);
    assert.equal(pgClientConfig(`${BASE}?sslmode=no-verify`, CA).connectionString, BASE);
  });

  it('strips every ssl* param, any case, and keeps the others in order', () => {
    const url = `${BASE}?application_name=ingest&sslmode=verify-full&sslrootcert=%2Ftmp%2Fca.crt&SSLCERT=x&sslkey=y&ssl=true&sslnegotiation=direct&connect_timeout=10`;
    assert.equal(pgClientConfig(url, CA).connectionString, `${BASE}?application_name=ingest&connect_timeout=10`);
  });

  it('keeps the password encoding, host, port and db byte-for-byte', () => {
    const c = pgClientConfig(`${BASE}?sslmode=disable&options=-c%20search_path%3Dpublic`, CA);
    assert.equal(c.connectionString, `${BASE}?options=-c%20search_path%3Dpublic`);
    assert.ok(c.connectionString.includes('p%40ss%26word@aws-0-us-east-1.pooler.example.test:6543/postgres'));
  });

  it('cannot be weakened from the URL', () => {
    const c = pgClientConfig(`${BASE}?sslmode=disable&rejectUnauthorized=false`, CA);
    assert.equal(c.ssl.rejectUnauthorized, true);
    assert.ok(!/ssl/i.test(c.connectionString.split('?')[1] ?? ''));
  });

  it('defaults to the bundled Supabase CA file', () => {
    const c = pgClientConfig(BASE);
    assert.equal(c.ssl.ca, readFileSync(SUPABASE_CA_PATH, 'utf8'));
    assert.match(c.ssl.ca, /^-----BEGIN CERTIFICATE-----/);
  });

  it('pg.Client ends up verifying even when the URL says sslmode=disable or no-verify (no connect)', () => {
    for (const q of ['sslmode=disable', 'sslmode=no-verify', 'sslmode=require&sslrootcert=%2Fnope']) {
      const client = new pg.Client(pgClientConfig(`${BASE}?${q}`, CA));
      assert.deepEqual(client.connectionParameters.ssl, { ca: CA, rejectUnauthorized: true }, q);
    }
  });
});
