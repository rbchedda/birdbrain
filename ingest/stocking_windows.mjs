// Scrape PGC's pheasant allocation pages into committed seed data, and load
// that seed into public.stocking_events / public.stocking_properties.
//
//   node ingest/stocking_windows.mjs                        # fetch pa.gov, write data/pgc/pheasant-allocation-<season>.json
//   node ingest/stocking_windows.mjs --from <dir>           # parse saved pages instead (overview.html, <region>.html)
//   DATABASE_URL=postgres://... node ingest/stocking_windows.mjs --load data/pgc/pheasant-allocation-2026-27.json
//
// Source: Pennsylvania Game Commission, "Pheasant Allocation" and its six
// "<Region> Region Pheasant Stocking Locations" pages,
// https://www.pa.gov/agencies/pgc/huntingandtrapping/get-started-hunting/pheasant-hunting/pheasant-allocation
// The pages are HTML tables with no API. Each region page has a county ->
// stocked properties table (bold-underlined game lands also get the 2nd and
// 3rd winter releases) and a county x release table of cocks and hens with
// the week each release ships. PGC publishes counts per county, not per
// property. Changes made here: dates gain a year from the season, county names
// are title-cased, and property lists are split into one row per property.
// Cite PGC wherever this data is shown; it is provided "as is".
//
// Output is deterministic (sorted, no timestamps), and every count is checked
// against the pages' own county, region and statewide totals before writing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FETCH_TIMEOUT_MS, slug } from './arcgis.mjs';

export const ALLOCATION_URL =
  'https://www.pa.gov/agencies/pgc/huntingandtrapping/get-started-hunting/pheasant-hunting/pheasant-allocation';
const CITATION = 'Pennsylvania Game Commission, Pheasant Allocation (pa.gov). Provided "as is"; not affiliated with BirdBrain.';
const DATA_DIR = new URL('../data/pgc/', import.meta.url);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// ---------------------------------------------------------------------------
// HTML helpers (the pages are simple tables; no parser dependency needed)
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

/** Visible text of an HTML fragment, whitespace collapsed, zero-width characters removed. */
export const text = (html) =>
  decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

/** Every <table> as rows of { html, text, colspan } cells. */
export function tables(html) {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(([t]) =>
    [...t.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(([tr]) =>
      [...tr.matchAll(/<t([hd])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)].map(([, , attrs, inner]) => ({
        html: inner,
        text: text(inner),
        colspan: Number(/colspan="?(\d+)/i.exec(attrs)?.[1] ?? 1),
      })),
    ),
  );
}

const int = (s) => {
  const v = String(s).replace(/,/g, '').trim();
  if (!/^\d+$/.test(v)) throw new Error(`Expected a count, got "${s}"`);
  return Number(v);
};
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(mc)?([a-z])/g, (m, sep, mc, c) => sep + (mc ? 'Mc' : '') + c.toUpperCase());
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** "1ST IN- SEASON" -> in_season_1, "PRE- SEASON" -> pre_season, "YOUTH HUNT" -> youth. */
export function releaseKey(label) {
  const l = label.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (/^(YOUTH|JUNIOR)\b/.test(l)) return 'youth';
  if (/^PRE ?SEASON$/.test(l)) return 'pre_season';
  const m = /^(\d+)(ST|ND|RD|TH) (IN ?SEASON|WINTER)$/.exec(l);
  if (m) return `${m[3] === 'WINTER' ? 'winter' : 'in_season'}_${m[1]}`;
  throw new Error(`Unknown release column "${label}"`);
}

/**
 * "Oct 8-9", "Nov. 3-6", "Oct 30-Nov 2" -> ISO dates. July-December fall in
 * the season's first year, January-June in the second.
 */
export function shipWeek(label, season) {
  const startYear = Number(season.slice(0, 4));
  const m = /^([a-z]{3})[a-z]*\.?\s*(\d{1,2})\s*[-–]\s*(?:([a-z]{3})[a-z]*\.?\s*)?(\d{1,2})$/i.exec(label.trim());
  if (!m) throw new Error(`Unparseable ship week "${label}"`);
  const iso = (mon, day) => {
    const month = MONTHS[mon.toLowerCase()];
    if (!month) throw new Error(`Unknown month in "${label}"`);
    const year = month >= 7 ? startYear : startYear + 1;
    const d = new Date(Date.UTC(year, month - 1, Number(day)));
    if (d.getUTCMonth() !== month - 1) throw new Error(`Invalid date in "${label}"`);
    return d.toISOString().slice(0, 10);
  };
  return { start: iso(m[1], m[2]), end: iso(m[3] ?? m[1], m[4]) };
}

/** Season ("2026-27") from the overview heading "2026 Pheasant Allocation". */
export function parseSeason(overviewHtml) {
  const m = /(20\d\d)\s+Pheasant Allocation/i.exec(text(overviewHtml));
  if (!m) throw new Error('Could not find "<year> Pheasant Allocation" on the overview page');
  const y = Number(m[1]);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Region page links from the overview page, as { region, url }. */
export function parseRegionLinks(overviewHtml, base = ALLOCATION_URL) {
  const found = new Map();
  for (const [, href, name] of overviewHtml.matchAll(/href="([^"]*\/pheasant-allocation\/(\w+)-region-pheasant-allocation)"/gi)) {
    found.set(titleCase(name), new URL(href, base).href);
  }
  return [...found].map(([region, url]) => ({ region, url })).sort((a, b) => a.region.localeCompare(b.region));
}

/**
 * Overview "Seasonal Breakdown" table: per region, cocks (males) and hens
 * (females) for the junior hunt, pre/in-season and winter releases.
 */
export function parseRegionTotals(overviewHtml) {
  const t = tables(overviewHtml).find((rows) => /seasonal breakdown/i.test(rows[0]?.[0]?.text ?? ''));
  if (!t) throw new Error('Seasonal Breakdown table not found on the overview page');
  const totals = {};
  for (const row of t) {
    const cells = row.map((c) => c.text);
    if (cells.length !== 10 || !/^[A-Za-z]+$/.test(cells[0]) || !/\d/.test(cells[1])) continue;
    const [jc, jh, sc, sh, wc, wh, total, cocks, hens] = cells.slice(1).map(int);
    totals[cells[0].toUpperCase() === 'TOTAL' ? 'TOTAL' : titleCase(cells[0])] =
      { junior: { cocks: jc, hens: jh }, season: { cocks: sc, hens: sh }, winter: { cocks: wc, hens: wh }, total, cocks, hens };
  }
  return totals;
}

/** SGL numbers in a cell like "SGL <b><u>60</u></b>, 77, <b><u>87</u></b>". */
function parseGameLands(cellHtml) {
  const marked = cellHtml
    .replace(/&nbsp;/g, ' ')
    .replace(/<(b|strong|u)\b[^>]*>\s*<(b|strong|u)\b[^>]*>\s*(\d+)\s*<\/\2>\s*<\/\1>/gi, ' *$3 ');
  return [...text(marked).matchAll(/(\*?)(\d{1,3})\b/g)].map(([, star, n]) => ({ sgl: Number(n), winter: star === '*' }));
}

/** One region page -> { properties, events, totals }. */
export function parseRegionPage(html, { region, season, url }) {
  const all = tables(html);
  const propTable = all.find((rows) => /other properties/i.test(rows[0]?.map((c) => c.text).join(' ') ?? ''));
  const allocTable = all.find((rows) => rows.some((r) => /ship the week/i.test(r[0]?.text ?? '')));
  if (!propTable || !allocTable) throw new Error(`${region}: expected a properties table and an allocation table`);
  if (!/bold underlined[\s\S]{0,80}2\s*nd and 3\s*rd winter/i.test(text(html))) {
    throw new Error(`${region}: the "Bold Underlined ... 2nd and 3rd Winter Releases" note is gone; check what bold means now`);
  }

  const properties = [];
  for (const row of propTable.slice(1)) {
    if (row.length < 3 || !row[0].text) continue;
    const county = titleCase(row[0].text);
    for (const { sgl, winter } of parseGameLands(row[1].html)) {
      properties.push({ region, county, name: `State Game Lands ${sgl}`, sgl, winter_late: winter });
    }
    for (const name of row[2].text.split(',').map((s) => s.trim()).filter(Boolean)) {
      properties.push({ region, county, name, sgl: null, winter_late: false });
    }
  }

  // Header row of release names, then "Ship the week of ->" dates, then
  // COCKS/HENS row pairs per county, then TOTALS, then the grand total.
  const headerIndex = allocTable.findIndex((r) => r.some((c) => /pre-?\s*season/i.test(c.text)));
  const weekRow = allocTable.find((r) => /ship the week/i.test(r[0]?.text ?? ''));
  const header = allocTable[headerIndex];
  // The header's first cell spans the county and sex columns.
  const labels = header.slice(1, -1).map((c) => c.text);
  if (!/county total/i.test(header.at(-1).text)) throw new Error(`${region}: last allocation column is not COUNTY TOTAL`);
  const releases = labels.map((label, i) => {
    const { start, end } = shipWeek(weekRow[i + 1].text, season);
    return { release: releaseKey(label), label, ship_week: weekRow[i + 1].text, window_start: start, window_end: end };
  });

  const counts = {}; // county -> { cocks: [...], hens: [...], cocksTotal, hensTotal }
  let current = null;
  let grand = null;
  for (const row of allocTable) {
    const cells = row.map((c) => c.text);
    if (cells.length === 1 && /^[\d,]+$/.test(cells[0])) grand = int(cells[0]);
    const sex = cells[1]?.toUpperCase();
    if (sex !== 'COCKS' && sex !== 'HENS') continue;
    if (cells[0]) current = cells[0].toUpperCase() === 'TOTALS' ? 'TOTALS' : titleCase(cells[0]);
    if (!current) throw new Error(`${region}: count row before any county`);
    const values = cells.slice(2, 2 + releases.length).map(int);
    if (values.length !== releases.length) throw new Error(`${region}: ${current} ${sex} has ${values.length} releases, expected ${releases.length}`);
    const total = int(cells[2 + releases.length]);
    if (sum(values) !== total) throw new Error(`${region}: ${current} ${sex} releases sum to ${sum(values)}, table says ${total}`);
    counts[current] ??= {};
    counts[current][sex.toLowerCase()] = values;
  }

  const { TOTALS: totalsRow, ...byCounty } = counts;
  if (!totalsRow?.cocks || !totalsRow?.hens) throw new Error(`${region}: TOTALS row missing`);
  for (const sex of ['cocks', 'hens']) {
    releases.forEach((r, i) => {
      const s = sum(Object.values(byCounty).map((c) => c[sex]?.[i] ?? 0));
      if (s !== totalsRow[sex][i]) throw new Error(`${region}: ${r.label} ${sex} counties sum to ${s}, TOTALS says ${totalsRow[sex][i]}`);
    });
  }
  if (grand !== null && grand !== sum(totalsRow.cocks) + sum(totalsRow.hens)) {
    throw new Error(`${region}: grand total ${grand} != cocks + hens`);
  }

  const events = [];
  for (const [county, c] of Object.entries(byCounty)) {
    if (!c.cocks || !c.hens) throw new Error(`${region}: ${county} lacks a COCKS or HENS row`);
    releases.forEach((r, i) => {
      events.push({
        region, county, release: r.release, label: r.label, junior: r.release === 'youth', ship_week: r.ship_week,
        window_start: r.window_start, window_end: r.window_end, cocks: c.cocks[i], hens: c.hens[i],
      });
    });
  }

  const countiesA = new Set(properties.map((p) => p.county));
  const countiesB = new Set(Object.keys(byCounty));
  const mismatch = [...countiesA.symmetricDifference(countiesB)];
  if (mismatch.length) throw new Error(`${region}: counties differ between the two tables: ${mismatch.join(', ')}`);

  const bucket = (pred) => ({
    cocks: sum(events.filter(pred).map((e) => e.cocks)),
    hens: sum(events.filter(pred).map((e) => e.hens)),
  });
  return {
    region: { region, url, ship_weeks: releases.map(({ release, label, ship_week }) => ({ release, label, ship_week })) },
    properties,
    events,
    totals: {
      junior: bucket((e) => e.release === 'youth'),
      season: bucket((e) => e.release === 'pre_season' || e.release.startsWith('in_season')),
      winter: bucket((e) => e.release.startsWith('winter')),
    },
  };
}

/**
 * Parse the overview and every region page into the seed object. `pages` maps
 * region name -> HTML. Throws if any total disagrees with the overview table.
 */
export function buildSeed(overviewHtml, pages) {
  const season = parseSeason(overviewHtml);
  const links = parseRegionLinks(overviewHtml);
  if (links.length === 0) throw new Error('No region pages linked from the overview page');
  const expected = parseRegionTotals(overviewHtml);
  const regions = [];
  const properties = [];
  const events = [];
  for (const { region, url } of links) {
    if (!pages[region]) throw new Error(`Missing page for ${region}`);
    const parsed = parseRegionPage(pages[region], { region, season, url });
    const want = expected[region];
    if (!want) throw new Error(`${region} is not in the overview's Seasonal Breakdown table`);
    for (const k of ['junior', 'season', 'winter']) {
      if (parsed.totals[k].cocks !== want[k].cocks || parsed.totals[k].hens !== want[k].hens) {
        throw new Error(`${region}: ${k} totals ${JSON.stringify(parsed.totals[k])} != overview ${JSON.stringify(want[k])}`);
      }
    }
    regions.push(parsed.region);
    properties.push(...parsed.properties);
    events.push(...parsed.events);
  }
  if (expected.TOTAL && sum(events.map((e) => e.cocks + e.hens)) !== expected.TOTAL.total) {
    throw new Error(`Statewide total ${sum(events.map((e) => e.cocks + e.hens))} != overview ${expected.TOTAL.total}`);
  }
  const order = (a, b) => a.region.localeCompare(b.region) || a.county.localeCompare(b.county);
  const releaseOrder = (r) => (r === 'youth' ? 0 : r === 'pre_season' ? 1 : r.startsWith('in_season') ? 10 : 20) + Number(/_(\d+)$/.exec(r)?.[1] ?? 0);
  return {
    source: ALLOCATION_URL,
    citation: CITATION,
    season,
    regions,
    properties: properties.sort((a, b) => order(a, b) || (a.sgl ?? 1e9) - (b.sgl ?? 1e9) || a.name.localeCompare(b.name)),
    events: events.sort((a, b) => order(a, b) || releaseOrder(a.release) - releaseOrder(b.release)),
  };
}

/** JSON with one array element per line, so seed diffs read row by row. */
export function formatSeed(seed) {
  const lines = ['{'];
  const entries = Object.entries(seed);
  entries.forEach(([k, v], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    if (Array.isArray(v)) {
      lines.push(`  ${JSON.stringify(k)}: [`);
      v.forEach((x, j) => lines.push(`    ${JSON.stringify(x)}${j < v.length - 1 ? ',' : ''}`));
      lines.push(`  ]${comma}`);
    } else {
      lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    }
  });
  return `${lines.join('\n')}\n}\n`;
}

// ---------------------------------------------------------------------------
// Fetching and loading
// ---------------------------------------------------------------------------

async function getText(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetchImpl(url, { signal });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    if (signal.aborted) throw new Error(`GET ${url} timed out after ${timeoutMs} ms`);
    throw err;
  }
}

/** Fetch the overview and region pages from pa.gov. */
export async function fetchPages({ fetchImpl = fetch, timeoutMs } = {}) {
  const overview = await getText(ALLOCATION_URL, fetchImpl, timeoutMs);
  const pages = {};
  for (const { region, url } of parseRegionLinks(overview)) pages[region] = await getText(url, fetchImpl, timeoutMs);
  return { overview, pages };
}

/**
 * Replace one season's allocation in the database with the seed, in one
 * transaction: upsert events and properties, delete rows the seed no longer
 * has, and link properties to places. `db` is pg.Client or PGlite.
 */
export async function loadSeed(db, seed) {
  if (!seed.events?.length || !seed.properties?.length) {
    throw new Error(`Seed for ${seed.season} has no events or properties; refusing to wipe the season.`);
  }
  await db.query('begin');
  try {
    for (const e of seed.events) {
      await db.query(
        `insert into public.stocking_events
           (season, region, county, release, release_label, junior, ship_week, window_start, window_end, cocks, hens, source)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (season, county, release) do update set
           region = excluded.region, release_label = excluded.release_label, junior = excluded.junior,
           ship_week = excluded.ship_week, window_start = excluded.window_start, window_end = excluded.window_end,
           cocks = excluded.cocks, hens = excluded.hens, source = excluded.source, updated_at = now()`,
        [seed.season, e.region, e.county, e.release, e.label, e.junior, e.ship_week, e.window_start, e.window_end,
          e.cocks, e.hens, seed.source],
      );
    }
    for (const p of seed.properties) {
      await db.query(
        `insert into public.stocking_properties (season, region, county, name, sgl, winter_late, source)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (season, county, name) do update set
           region = excluded.region, sgl = excluded.sgl, winter_late = excluded.winter_late,
           source = excluded.source, updated_at = now()`,
        [seed.season, p.region, p.county, p.name, p.sgl, p.winter_late, seed.source],
      );
    }
    const eventKeys = seed.events.map((e) => `${e.county}|${e.release}`);
    const propKeys = seed.properties.map((p) => `${p.county}|${p.name}`);
    const deletedEvents = await db.query(
      `delete from public.stocking_events where season = $1 and not (county || '|' || release = any($2::text[]))`,
      [seed.season, eventKeys],
    );
    const deletedProps = await db.query(
      `delete from public.stocking_properties where season = $1 and not (county || '|' || name = any($2::text[]))`,
      [seed.season, propKeys],
    );
    await linkPlaces(db, seed.season);
    await db.query('commit');
    return {
      season: seed.season,
      events: seed.events.length,
      properties: seed.properties.length,
      deleted: (deletedEvents.rowCount ?? deletedEvents.affectedRows ?? 0) + (deletedProps.rowCount ?? deletedProps.affectedRows ?? 0),
    };
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

/**
 * Point each stocking property at a place: game lands at their pheasant
 * stocking point (or the game land itself), other properties at the one
 * stocking point whose name matches or extends theirs ("Blue Marsh" ->
 * "Blue Marsh Lake"). Ambiguous or unmatched names stay unlinked.
 */
async function linkPlaces(db, season) {
  await db.query(
    `update public.stocking_properties sp set place_id = coalesce(
       (select id from public.places where source = 'pgc:pheasant_stocking' and source_id = 'sgl:' || sp.sgl),
       (select id from public.places where source = 'pgc:state_game_lands' and source_id = sp.sgl::text))
     where sp.season = $1 and sp.sgl is not null`,
    [season],
  );
  await db.query(
    `update public.stocking_properties sp set place_id = (
       select case when count(*) = 1 then min(p.id::text)::uuid end from public.places p
        where p.source = 'pgc:pheasant_stocking'
          and (lower(p.name) = lower(sp.name) or lower(p.name) like lower(sp.name) || ' %'))
     where sp.season = $1 and sp.sgl is null`,
    [season],
  );
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

  const load = value('--load');
  if (load) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Set DATABASE_URL to load a seed.');
    const seed = JSON.parse(readFileSync(load, 'utf8'));
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      console.log(JSON.stringify(await loadSeed(client, seed)));
    } finally {
      await client.end();
    }
    return;
  }

  let overview;
  let pages = {};
  const from = value('--from');
  if (from) {
    overview = readFileSync(join(from, 'overview.html'), 'utf8');
    for (const { region } of parseRegionLinks(overview)) pages[region] = readFileSync(join(from, `${slug(region)}.html`), 'utf8');
  } else {
    ({ overview, pages } = await fetchPages());
  }
  const seed = buildSeed(overview, pages);
  const out = value('--out') ?? new URL(`pheasant-allocation-${seed.season}.json`, DATA_DIR).pathname;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, formatSeed(seed));
  console.log(`Wrote ${seed.events.length} release windows and ${seed.properties.length} properties ` +
    `for ${seed.regions.length} regions (${seed.season}) to ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
