import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { classifyAccess } from '../app/src/data/access.ts';
import { SOURCES, toRows } from './arcgis.mjs';

const live = JSON.parse(readFileSync(new URL('./fixtures/pgc-live-sample.json', import.meta.url), 'utf8')).sources;
const stockingFeature = (props) => ({
  properties: { globalid: 'g', property_name: 'X', ...props },
  geometry: { type: 'Point', coordinates: [-77, 40.5] },
});

describe('access_type (who controls the land)', () => {
  it('fails closed: a stocking point with no property_type is unknown, even with a public-sounding name', () => {
    for (const property_type of [null, undefined, '', 'Something New']) {
      const [row] = toRows(SOURCES.pheasant_stocking, [stockingFeature({ property_name: 'Furman Hunter Access Property', property_type })]);
      assert.equal(JSON.parse(row.properties).access_type, null, `property_type=${property_type}`);
    }
    assert.equal(classifyAccess({ type: 'stocking', name: 'Codorus State Park', propertyType: null }), null);
  });

  it('every live stocking feature with a property_type gets a definite rule, and missing ones stay hidden', () => {
    const rows = toRows(SOURCES.pheasant_stocking, live.pheasant_stocking.features);
    for (const row of rows) {
      const r = { name: row.name, properties: JSON.parse(row.properties) };
      if (r.properties.property_type == null) assert.equal(r.properties.access_type, null, r.name);
      if (r.properties.property_type === 'SGL') assert.equal(r.properties.access_type, 'state_game_land', r.name);
    }
  });

  it('maps PGC property types and access programs', () => {
    const c = (name, propertyType, sgl = null) => classifyAccess({ type: 'stocking', name, propertyType, sgl });
    assert.equal(c('State Game Lands 109', 'SGL', 109), 'state_game_land');
    assert.equal(c('Carlson Hunter Access Property', 'Other Properties'), 'enrolled_private');
    assert.equal(c('Codorus State Park', 'Other Properties'), 'other_public');
    assert.equal(c('Allegheny National Forest', 'Other Properties'), 'other_public');
    assert.equal(c('Tionesta Lake', 'Other Properties'), 'other_public');
    // Names that don't say who owns the land are hidden, not guessed.
    for (const n of ['Hanson Aggregates', 'Butler Enterprise Property', 'Muddy Run', 'Menser Road', 'Chester Water Authority'])
      assert.equal(c(n, 'Other Properties'), null, n);
    assert.equal(c('State Game Lands 12', 'SGL', null), null);
  });

  it('dove fields: SGL overlap is a game land, cooperator text is enrolled, anything else unknown', () => {
    const d = (sgl, description) => classifyAccess({ type: 'dove_field', name: '', sgl, description });
    assert.equal(d(280, null), 'state_game_land');
    assert.equal(d(null, 'State Game Land 280 and Public Access Property Cooperator 425 (Blue Marsh) provide dove hunting'), 'enrolled_private');
    assert.equal(d(null, 'Half millet and half Sunflower'), null);
    assert.equal(classifyAccess({ type: 'game_land', name: 'State Game Lands 1' }), 'state_game_land');
  });
});
