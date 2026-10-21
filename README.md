# BirdBrain

A social app for bird hunters, launching in Pennsylvania. It helps new and
returning hunters find public land, learn the rules, and build a community.

## Layout

| Path | What |
| --- | --- |
| `app/` | Expo (React Native, TypeScript) app for iOS, Android and web |
| `supabase/` | Postgres + PostGIS schema migrations |
| `ingest/` | Data ingestion jobs (PGC ArcGIS layers → `places`, pheasant allocation → `stocking_events`) |
| `data/` | Committed seed data scraped from PGC pages |

## App

```sh
cd app
npm install
npm run web        # or: npm start, then scan the QR code with Expo Go
npm test           # jest
npm run typecheck
```

Runs in Expo Go and in a desktop browser with no setup: without Supabase keys
it uses built-in sample places and posts, and your own posts stay on the device.
To use Supabase, copy the `EXPO_PUBLIC_SUPABASE_*` lines from `.env.example`
into `app/.env` (anon or publishable key only) and restart Expo. In the
Supabase dashboard, enable anonymous sign-ins for "Continue as guest", and turn
off email confirmation if testers should sign up without checking email.

| Tab | What |
| --- | --- |
| Map | Pheasant Planner: game lands, stocking points and dove fields from `places`; "open today" per species from the season calendar (`app/src/data/seasons.ts`), legal hours from sunrise/sunset, Sunday rules; stocking windows from `stocking_events` |
| Feed | Posts from `posts` (RLS applies the next-day delay and blocks), paginated, with likes, comments, report and block |
| Log | After-the-hunt post: species, bird counts per place, notes. Shared posts are delayed until midnight ET; private entries never leave the device |
| Crew | Species groups (`groups`, `group_members`) |
| Learn | Season dates, legal hours and the privacy model |

The map is MapLibre GL JS with USGS National Map tiles, inside a WebView on
iOS/Android and an iframe on web, so it works in Expo Go. A MapLibre Native
development build can replace it as `app/src/components/map/PlaceMap.native.tsx`
with the same props (`app/src/components/map/types.ts`).

Season dates in `seasons.ts` are statewide 2026-27 dates; update them each
license year and verify against the PGC digest.

## Database

Migrations live in `supabase/migrations`. They are tested without Docker by
running them in [PGlite](https://pglite.dev) (Postgres + PostGIS in WASM)
against a small stub of Supabase's `auth` and `storage` schemas:

```sh
npm install
npm run db:test
```

To use a hosted project: `npx supabase login`, `npx supabase link`, then
`npx supabase db push`.

Privacy and safety model:

- A post's exact location is stored in `post_locations`, which only the author can read. Everyone else sees `posts.blurred_geom`, a trigger-derived point snapped to a ~5 km grid. Saved posts and saved spots are owner-only.
- Posts are hidden from other users until midnight Eastern on the day after they are created (`posts.public_after`, set by trigger). PA law bars using phones to alert another hunter to live game, so nothing in BirdBrain is real-time. Comments and likes follow the post's visibility.
- Which places a hunter logged and the per-place bird counts live in `post_place_counts`, author-only like `post_locations`. A trigger copies only the totals into `posts.counts`.
- Users can block each other (`user_blocks`, hides posts and comments both ways) and report posts, comments or profiles (`reports`). Moderators work the `reports` queue with the service role. Apple requires both for apps with user content, TestFlight included.

## Ingestion

Two jobs, both plain Node (no extra dependencies). Every network request has a timeout (`INGEST_FETCH_TIMEOUT_MS`, default 60 s), so one slow PGC endpoint fails its own source instead of hanging the run.

### PGC map layers → `places` (`ingest/arcgis.mjs`)

| Source | Layer | `places.type` | `source_id` |
|---|---|---|---|
| `game_lands` | State_Game_Lands_Boundaries/300 | `game_land` | SGL number |
| `pheasant_stocking` | Pheasant_Hunting_Pennsylvania/100 | `stocking` | `sgl:<n>` or `name:<slug>` |
| `dove_fields` | Managed_Dove_Fields_(Public_View)/0 | `dove_field` | GlobalID |

Each run checks the layer's `editingInfo.lastEditDate` against `ingest_state` and skips unchanged layers. Re-runs are safe, features removed upstream are deleted, and a run that returns no usable rows fails instead of wiping the table.

```
npm run ingest:describe                              # live fields (* = mapped), drift check, sample rows; no DB
DATABASE_URL=postgres://... npm run ingest           # all sources
DATABASE_URL=postgres://... npm run ingest -- pheasant_stocking --force
node ingest/arcgis.mjs --out data/raw                # fetch GeoJSON only
```

The `SOURCES` mappings were checked against the live layers with `ingest:describe` on 2026-10-21. A full offline load into PGlite mapped every feature: 319 game lands, 216 stocking points and 83 dove fields. `ingest/fixtures/pgc-live-sample.json` holds the captured schemas and sample rows the tests run against. `ingest:describe` exits non-zero if a mapped field disappears upstream. Unmapped attributes are kept in `properties.raw`. Notes on the live data:

- No layer has a county field, so `places.county` is null for PGC rows.
- Stocking points are keyed by property, not GlobalID, because PGC re-created every feature for the 2026-27 season; game lands come through as a bare number in `property_name` and are named `State Game Lands <n>`.
- A dove field's game land comes from polygon overlap with `game_lands` (loaded first), not from `Project_Name`, which mixes SGL numbers with other codes (411, 414, 419 and 2425 aren't on game lands). Crops are pulled from the free-text `Description`.

`.github/workflows/ingest.yml` runs the layer ingester hourly October to February and daily the rest of the year. Add a `DATABASE_URL` repository secret to enable it.

### Pheasant allocation → `stocking_events` (`ingest/stocking_windows.mjs`)

PGC publishes release windows only as HTML tables: an overview page and one page per region. The script turns them into `data/pgc/pheasant-allocation-<season>.json`, which is committed:

- `events`: cocks and hens per county for each release (junior/youth hunt, pre-season, four in-season, three winter), with the week PGC ships it, dated using the season year from the page heading.
- `properties`: the game lands and other properties stocked in each county. `winter_late` marks the bold-underlined game lands that also get the 2nd and 3rd winter releases.

PGC gives counts per county, not per property, so they live on `stocking_events`. The property list goes in `stocking_properties`, and junior and adult totals are in the `stocking_county_totals` view. All three are public read and service-role write. Before anything is written, every count is checked against the county, region and statewide totals on the pages; the run stops if a table changes shape. Output is deterministic, so a re-run with unchanged pages produces an identical file.

```
node ingest/stocking_windows.mjs                     # scrape pa.gov, rewrite the seed file
node ingest/stocking_windows.mjs --from <dir>        # parse saved pages (overview.html, <region>.html)
DATABASE_URL=postgres://... node ingest/stocking_windows.mjs --load data/pgc/pheasant-allocation-2026-27.json
```

`--load` replaces that season's rows in one transaction, refuses an empty seed, and links properties to `places`. It isn't scheduled yet.

### Data terms

Data: Pennsylvania Game Commission. The PGC Mapping Center license on these layers requires that PGC be clearly cited in anything derived from the data and that any modifications be described. The data is provided "as is", with no warranty. The allocation tables are PGC content on pa.gov and are cited the same way (`citation` in each seed file). Changes BirdBrain makes:

- Game lands split across polygons are merged into one row.
- Blank dove field acreage is computed from the geometry.
- Dove fields are tagged with the game land they overlap.
- Allocation dates gain a year, and property lists are split into one row per property.

The app's data page must show the citation and the "as is" disclaimer. BirdBrain is not affiliated with the PGC.

## Open items

- No `DATABASE_URL` yet: nothing has been loaded into a hosted database. First load: run `ingest` (game lands before dove fields; `SOURCES` is already in that order), then `stocking_windows.mjs --load`.
- Schedule the allocation scrape and load (for example weekly from September to February in `ingest.yml`), and decide whether a changed seed should open a PR or load directly.
- Junior hunt stocking sites are published separately as a PDF (linked from the allocation page) and aren't scraped. `stocking_events` has the junior counts per county but not the sites.
- `places.county` is empty for PGC rows; fill it by intersecting with a county boundary layer (e.g. PASDA).
- On the 2026-10-21 data, all 161 allocation game lands link to a place, but only 46 of 62 other properties do. The rest are named differently in the two PGC sources ("Prompton Army Corps" vs "Prompton State Park", "Mahoning Lake" vs "Mahoning Creek Lake") or are generic ("Various Hunter Access Properties"), so their `place_id` is null. A small alias table would close most of the gap.
- Verify migratory bird licensing and Sunday hunting copy against current PGC pages.
- eBird data needs written permission from Cornell for commercial use; hold the birdwatching section until that's settled.
