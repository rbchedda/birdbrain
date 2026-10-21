// Jest runs in Node; the app tsconfig has no Node types, so declare the bits used here.
declare const __dirname: string;
declare function require(name: 'fs'): { readdirSync(path: string): string[] };
const { readdirSync } = require('fs');

import { birds } from '@/data/birds';

import credits from '../../assets/birds/CREDITS.json';
import { checkCredits, licenseAllowed, type BirdCredit } from '../../scripts/check-bird-credits';

const ok: BirdCredit = {
  file: 'mourning-dove.webp',
  species: 'dove',
  title: 'Mourning dove',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  author: 'A. Photographer',
  license: 'CC-BY-SA-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  retrieved: '2026-10-21',
  changes: 'Resized to 800px',
};

describe('bird photo credits (lint, runs in npm test)', () => {
  it('assets/birds and CREDITS.json agree, and every license is allowed', () => {
    const files = readdirSync(`${__dirname}/../../assets/birds`);
    expect(checkCredits(files, credits as BirdCredit[])).toEqual([]);
  });

  it('allow-list: PD, PD-USGov-FWS, CC0-1.0, CC-BY-*, CC-BY-SA-*; never NC or ND', () => {
    for (const l of ['PD', 'PD-USGov-FWS', 'CC0-1.0', 'CC-BY-2.0', 'CC-BY-4.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']) expect(licenseAllowed(l)).toBe(true);
    for (const l of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-SA-4.0', 'All rights reserved', '', 'GFDL']) expect(licenseAllowed(l)).toBe(false);
  });

  it('flags a missing entry, a missing file, a bad license, a CC BY without author, and eBird/Macaulay sources', () => {
    expect(checkCredits(['mourning-dove.webp'], [ok])).toEqual([]);
    expect(checkCredits(['x.webp'], [])).toEqual(['x.webp: no CREDITS.json entry']);
    expect(checkCredits([], [ok])).toEqual(['mourning-dove.webp: listed in CREDITS.json but the file is missing']);
    expect(checkCredits(['mourning-dove.webp'], [{ ...ok, license: 'CC-BY-NC-4.0' }])).toEqual([
      'mourning-dove.webp: license "CC-BY-NC-4.0" is not allowed',
    ]);
    expect(checkCredits(['mourning-dove.webp'], [{ ...ok, author: ' ' }])).toEqual(['mourning-dove.webp: missing author']);
    expect(checkCredits(['mourning-dove.webp'], [{ ...ok, license: 'PD', author: '' }])).toEqual([]);
    for (const url of ['https://ebird.org/species/moudov', 'https://search.macaulaylibrary.org/catalog?taxonCode=moudov', 'https://cdn.download.ams.birds.cornell.edu.macaulaylibrary.org/x']) {
      expect(checkCredits(['mourning-dove.webp'], [{ ...ok, sourceUrl: url }])).toEqual([
        'mourning-dove.webp: eBird / Macaulay Library sources are not allowed',
      ]);
    }
  });

  it('requires every field, an https source and a creativecommons.org license URL for CC', () => {
    for (const k of ['species', 'title', 'sourceUrl', 'license', 'licenseUrl', 'retrieved', 'changes'] as const) {
      expect(checkCredits(['mourning-dove.webp'], [{ ...ok, [k]: '' }])).toContain(`mourning-dove.webp: missing ${k}`);
    }
    expect(checkCredits(['mourning-dove.webp'], [{ ...ok, sourceUrl: 'http://example.org/x' }])).toEqual([
      'mourning-dove.webp: sourceUrl must be an https URL',
    ]);
    expect(checkCredits(['mourning-dove.webp'], [{ ...ok, licenseUrl: 'https://example.org/license' }])).toEqual([
      'mourning-dove.webp: licenseUrl must be the creativecommons.org deed',
    ]);
    expect(checkCredits(['mourning-dove.webp'], [{ ...ok, retrieved: 'Oct 21' }])).toEqual(['mourning-dove.webp: retrieved must be YYYY-MM-DD']);
  });

  it('bundled credits: one per Guide photo slot, matching species, all from Commons with real authors', () => {
    const list = credits as BirdCredit[];
    const slots = birds.flatMap((b) => b.photos.map((p) => ({ file: p.file, species: b.key })));
    const covered = slots.filter((s) => list.some((c) => c.file === s.file));
    for (const s of covered) expect(list.find((c) => c.file === s.file)!.species).toBe(s.species);
    for (const c of list) {
      expect(slots.map((s) => s.file)).toContain(c.file);
      expect(c.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(c.author.trim()).not.toBe('');
    }
  });

  it('ignores non-image files such as CREDITS.json', () => {
    expect(checkCredits(['CREDITS.json', '.gitkeep'], [])).toEqual([]);
  });
});
