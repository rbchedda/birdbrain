import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createTestDb } from '../supabase/tests/db.mjs';
import { SOURCES, toRows, upsertRows } from './arcgis.mjs';
import {
  buildSeed, fetchPages, formatSeed, loadSeed, parseRegionLinks, parseRegionPage, parseSeason, releaseKey, shipWeek,
} from './stocking_windows.mjs';

// Trimmed copies of the pa.gov pages as of 2026-10-21 (title, notes, tables).
const page = (name) => readFileSync(new URL(`./fixtures/pgc-allocation/${name}.html`, import.meta.url), 'utf8');
const overview = page('overview');
const pages = Object.fromEntries(parseRegionLinks(overview).map(({ region }) => [region, page(region.toLowerCase())]));
const committed = JSON.parse(readFileSync(new URL('../data/pgc/pheasant-allocation-2026-27.json', import.meta.url)));
const liveSample = JSON.parse(readFileSync(new URL('./fixtures/pgc-live-sample.json', import.meta.url))).sources;

describe('releaseKey', () => {
  it('normalizes the published column headings', () => {
    assert.deepEqual(
      ['YOUTH HUNT', 'PRE- SEASON', '1ST IN- SEASON', '4TH IN- SEASON', '1ST WINTER', '3RD WINTER'].map(releaseKey),
      ['youth', 'pre_season', 'in_season_1', 'in_season_4', 'winter_1', 'winter_3'],
    );
    assert.throws(() => releaseKey('SPRING BONUS'), /Unknown release column/);
  });
});

describe('shipWeek', () => {
  it('dates fall releases in the first year and January ones in the second', () => {
    assert.deepEqual(shipWeek('Nov. 3-6', '2026-27'), { start: '2026-11-03', end: '2026-11-06' });
    assert.deepEqual(shipWeek('Jan. 5-7', '2026-27'), { start: '2027-01-05', end: '2027-01-07' });
  });

  it('handles weeks that cross a month or a year', () => {
    assert.deepEqual(shipWeek('Oct 30-Nov 2', '2026-27'), { start: '2026-10-30', end: '2026-11-02' });
    assert.deepEqual(shipWeek('Dec. 30-Jan. 2', '2026-27'), { start: '2026-12-30', end: '2027-01-02' });
  });

  it('rejects anything else', () => {
    assert.throws(() => shipWeek('TBD', '2026-27'), /Unparseable/);
    assert.throws(() => shipWeek('Nov 31-32', '2026-27'), /Invalid date/);
  });
});

describe('parsing the allocation pages', () => {
  it('reads the season from the overview heading', () => {
    assert.equal(parseSeason(overview), '2026-27');
    assert.throws(() => parseSeason('<h1>Pheasant Allocation</h1>'), /Could not find/);
  });

  it('finds the six region pages', () => {
    assert.deepEqual(parseRegionLinks(overview).map((r) => r.region),
      ['Northcentral', 'Northeast', 'Northwest', 'Southcentral', 'Southeast', 'Southwest']);
  });

  it('splits properties per county and flags bold-underlined game lands for the late winter releases', () => {
    const { properties } = parseRegionPage(pages.Northcentral, { region: 'Northcentral', season: '2026-27', url: 'u' });
    const clearfield = properties.filter((p) => p.county === 'Clearfield').map((p) => [p.sgl, p.winter_late]);
    assert.deepEqual(clearfield, [[60, true], [77, false], [87, true], [98, false]]);
    assert.deepEqual(properties.filter((p) => p.county === 'McKean').map((p) => p.name),
      ['State Game Lands 61', 'Allegheny National Forest', 'Carlson Hunter Access property']);
  });

  it('reads cocks and hens per county and release with dated windows', () => {
    const { events } = parseRegionPage(pages.Northcentral, { region: 'Northcentral', season: '2026-27', url: 'u' });
    assert.equal(events.length, 9 * 9);
    const centre = events.filter((e) => e.county === 'Centre');
    assert.deepEqual(centre[0], {
      region: 'Northcentral', county: 'Centre', release: 'youth', label: 'YOUTH HUNT', junior: true, ship_week: 'Oct 8-9',
      window_start: '2026-10-08', window_end: '2026-10-09', cocks: 160, hens: 60,
    });
    assert.equal(centre.at(-1).window_start, '2027-01-05');
    assert.equal(centre.reduce((n, e) => n + e.cocks, 0), 3620);
  });

  it('builds the statewide seed and checks it against the overview totals', () => {
    const seed = buildSeed(overview, pages);
    assert.equal(seed.season, '2026-27');
    assert.equal(seed.events.length, 62 * 9);
    assert.equal(seed.events.reduce((n, e) => n + e.cocks + e.hens, 0), 231_980);
    assert.equal(seed.events.filter((e) => e.junior).reduce((n, e) => n + e.cocks, 0), 12_880);
  });

  it('is deterministic', () => {
    const text = formatSeed(buildSeed(overview, pages));
    assert.equal(formatSeed(buildSeed(overview, pages)), text);
    assert.deepEqual(JSON.parse(text), buildSeed(overview, pages));
  });

  it('has a committed seed with a full, dated set of releases for every county', () => {
    assert.match(committed.citation, /Pennsylvania Game Commission/);
    const releasesByRegion = Object.fromEntries(committed.regions.map((r) => [r.region, r.ship_weeks.map((w) => w.release)]));
    const byCounty = Map.groupBy(committed.events, (e) => `${e.region}|${e.county}`);
    for (const [key, events] of byCounty) {
      assert.deepEqual(events.map((e) => e.release), releasesByRegion[key.split('|')[0]], key);
      for (const e of events) {
        assert.equal(e.junior, e.release === 'youth');
        assert.ok(e.window_start <= e.window_end && Number.isInteger(e.cocks) && Number.isInteger(e.hens), key);
      }
    }
    const counties = new Set(committed.properties.map((p) => `${p.region}|${p.county}`));
    assert.deepEqual([...counties].sort(), [...byCounty.keys()].sort());
  });

  it('fails loudly when a count no longer adds up', () => {
    const tampered = pages.Northcentral.replace('<p>160</p>', '<p>161</p>');
    assert.throws(() => parseRegionPage(tampered, { region: 'Northcentral', season: '2026-27', url: 'u' }),
      /Centre COCKS releases sum to 3621, table says 3620/);
    const shifted = pages.Southeast.replace('<p>300</p>', '<p>290</p>').replace('<p>3,580</p>', '<p>3,570</p>');
    assert.throws(() => buildSeed(overview, { ...pages, Southeast: shifted }), /TOTALS says/);
  });

  it('fails when the bold-means-late-winter note disappears', () => {
    const noNote = pages.Northcentral.replace(/Bold Underlined/, 'Highlighted');
    assert.throws(() => parseRegionPage(noNote, { region: 'Northcentral', season: '2026-27', url: 'u' }), /note is gone/);
  });

  it('times out a hung page fetch', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    await assert.rejects(fetchPages({ fetchImpl, timeoutMs: 20 }), /timed out after 20 ms/);
  });
});

describe('loadSeed', () => {
  it('loads a season, links properties to places, and is safe to re-run', async () => {
    const db = await createTestDb();
    await upsertRows(db, SOURCES.pheasant_stocking, toRows(SOURCES.pheasant_stocking, liveSample.pheasant_stocking.features));

    const first = await loadSeed(db, committed);
    assert.deepEqual(first, { season: '2026-27', events: 558, properties: 223, deleted: 0 });
    const again = await loadSeed(db, committed);
    assert.equal(again.deleted, 0);
    const { rows: [counts] } = await db.query(
      `select (select count(*) from public.stocking_events)::int events,
              (select count(*) from public.stocking_properties)::int properties`,
    );
    assert.deepEqual(counts, { events: 558, properties: 223 });

    const { rows: linked } = await db.query(
      `select sp.county, sp.name, p.name place from public.stocking_properties sp
         join public.places p on p.id = sp.place_id order by 1, 2`,
    );
    assert.deepEqual(linked.map((r) => [r.county, r.name, r.place]), [
      ['Carbon', 'Beltzville', 'Beltzville State Park'],
      ['Crawford', 'State Game Lands 101', 'State Game Lands 101'],
      ['Erie', 'State Game Lands 155', 'State Game Lands 155'],
      ['Fulton', 'State Game Lands 65', 'State Game Lands 65'],
      ['Susquehanna', 'Jeffers Tree Farm', 'Jeffers Tree Farm'],
    ]);

    const { rows: [centre] } = await db.query(
      `select junior_cocks, junior_hens, adult_cocks, adult_hens, first_adult_window::text, last_window::text
         from public.stocking_county_totals where county = 'Centre'`,
    );
    assert.deepEqual(centre, { junior_cocks: 160, junior_hens: 60, adult_cocks: 3460, adult_hens: 1180,
      first_adult_window: '2026-10-21', last_window: '2027-01-07' });
  });

  it('removes windows and properties dropped from a new seed for the same season', async () => {
    const db = await createTestDb();
    await loadSeed(db, committed);
    const smaller = {
      ...committed,
      events: committed.events.filter((e) => e.county !== 'Centre'),
      properties: committed.properties.filter((p) => p.county !== 'Centre'),
    };
    const result = await loadSeed(db, smaller);
    assert.equal(result.deleted, 9 + 2);
    const { rows } = await db.query(`select count(*)::int n from public.stocking_events where county = 'Centre'`);
    assert.equal(rows[0].n, 0);
  });

  it('refuses an empty seed and leaves the season alone', async () => {
    const db = await createTestDb();
    await loadSeed(db, committed);
    await assert.rejects(loadSeed(db, { ...committed, events: [] }), /refusing to wipe/);
    const { rows } = await db.query('select count(*)::int n from public.stocking_events');
    assert.equal(rows[0].n, 558);
  });
});
