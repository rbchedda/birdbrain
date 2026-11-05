#!/usr/bin/env node
/**
 * Dev-only helper for Expo-web screenshots of PastSeasonsCard.
 * Not imported by the app. Writes localStorage seed JSON for a mode.
 *
 * Usage: node scripts/seed-past-seasons-web.mjs populated|under3|empty [outfile.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACE = 'sgl-sample-1';
const AUTHOR = { id: 'sample-you', username: 'you', displayName: 'You (sample)' };

function entry(id, huntedOn, { flushes = 0, harvested = 0, startTime = null, weather = null } = {}) {
  return {
    id,
    clientId: id,
    author: AUTHOR,
    mine: true,
    kind: harvested > 0 ? 'harvest' : 'hunt',
    species: 'pheasant',
    caption: '',
    createdAt: `${huntedOn}T14:00:00.000Z`,
    publicAfter: null,
    huntedOn,
    location: 'hidden',
    area: null,
    counts: { flushed: flushes, roosters: 0, harvested },
    placeCounts: [{ placeId: PLACE, placeName: 'State Game Lands (sample A)', flushed: flushes, roosters: 0, harvested }],
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: { status: 'synced', version: 1, rev: 0, attempts: 0, nextAttemptAt: 0, error: null, conflict: false },
    details: {
      species: ['pheasant'],
      birds: harvested ? [{ species: 'pheasant', count: harvested, roosters: harvested, hens: 0 }] : [],
      dogs: [],
      cover: [],
      flushes,
      shots: 0,
      hours: 2,
      miles: null,
      startTime,
      weather,
      notes: '',
      photoUri: null,
      photoRemotePath: null,
    },
  };
}

const weather = { tempF: 42, windMph: 8, windDir: 'NW', sky: 'partly cloudy', precip: null };

const sets = {
  populated: [
    entry('ps-a', '2025-11-04', { flushes: 4, harvested: 1, startTime: '07:30', weather }),
    entry('ps-b', '2025-11-06', { flushes: 2, harvested: 0, startTime: '08:00', weather }),
    entry('ps-c', '2024-11-05', { flushes: 5, harvested: 2, startTime: '07:15', weather }),
    entry('ps-d', '2024-11-03', { flushes: 1, harvested: 0, startTime: '11:00', weather }),
  ],
  under3: [
    entry('ps-u1', '2025-11-05', { flushes: 3, harvested: 1, startTime: '07:45' }),
    entry('ps-u2', '2024-11-04', { flushes: 0, harvested: 0 }),
  ],
  empty: [],
};

const mode = process.argv[2] || 'populated';
if (!sets[mode]) {
  console.error('usage: node scripts/seed-past-seasons-web.mjs populated|under3|empty [outfile.json]');
  process.exit(1);
}

// TERMS_VERSION from app (keep in sync manually if bumped)
const termsPath = join(dirname(fileURLToPath(import.meta.url)), '../app/src/data/terms.ts');
const termsSrc = readFileSync(termsPath, 'utf8');
const tv = termsSrc.match(/TERMS_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? '2026-10-22';

const acceptance = {
  acceptedAt: '2026-11-01T12:00:00.000Z',
  appVersion: '0.1.0',
  termsVersion: tv,
};

const payload = {
  mode,
  placeId: PLACE,
  localStorage: {
    'birdbrain.journal.v2': JSON.stringify(sets[mode]),
    'birdbrain.termsAccepted.v1': JSON.stringify(acceptance),
    'birdbrain.ageGate.v1': JSON.stringify('passed'),
  },
};

const out = process.argv[3];
if (out) writeFileSync(out, JSON.stringify(payload, null, 2));
process.stdout.write(JSON.stringify(payload));
