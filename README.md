# BirdBrain

A social app for bird hunters, launching in Pennsylvania. It helps new and
returning hunters find public land, learn the rules, and build a community.

## Layout

| Path | What |
| --- | --- |
| `app/` | Expo (React Native, TypeScript) app for iOS, Android and web |
| `supabase/` | Postgres + PostGIS schema migrations |
| `ingest/` | Data ingestion jobs (PASDA State Game Lands → `places`) |

## App

```sh
cd app
npm install
npm run web        # or: npm run ios / npm run android
npm test           # jest
npm run typecheck
```

The map is a placeholder drawing for now. MapLibre needs a development build
(it isn't in Expo Go), so it comes in a later step.

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
- Users can block each other (`user_blocks`, hides posts and comments both ways) and report posts, comments or profiles (`reports`). Moderators work the `reports` queue with the service role. Apple requires both for apps with user content, TestFlight included.

## Ingestion

`ingest/arcgis.mjs` pulls Pennsylvania Game Commission ArcGIS FeatureServer layers into `places`:

| Source | Layer | `places.type` |
|---|---|---|
| `game_lands` | State_Game_Lands_Boundaries/300 | `game_land` |
| `pheasant_stocking` | Pheasant_Hunting_Pennsylvania/100 | `stocking` |
| `dove_fields` | Managed_Dove_Fields_(Public_View)/0 | `dove_field` |

Each run checks the layer's `editingInfo.lastEditDate` against `ingest_state` and skips unchanged layers. Re-runs are safe, features removed upstream are deleted, and a run that returns no usable rows fails instead of wiping the table.

```
npm run ingest:describe                              # print live field names and sample rows (no DB)
DATABASE_URL=postgres://... npm run ingest           # all sources
DATABASE_URL=postgres://... npm run ingest -- pheasant_stocking --force
node ingest/arcgis.mjs --out data/raw                # fetch GeoJSON only
```

The field mappings in `SOURCES` were written from the layer descriptions, not the live schemas. Run `ingest:describe` and fix any mapping before the first real load. Unmapped attributes are kept in `properties.raw`.

`.github/workflows/ingest.yml` runs the ingester hourly October to February and daily the rest of the year. Add a `DATABASE_URL` repository secret to enable it.

Data: Pennsylvania Game Commission, used under the PGC Mapping Center terms (cite PGC, describe changes, provided "as is"). BirdBrain is not affiliated with the PGC.

## Open items

- Run `npm run ingest:describe` and confirm the field mappings against the live PGC layers.
- Pheasant release windows by county come from PGC's regional allocation tables (HTML, no API); they belong in `stocking_events`.
- Verify migratory bird licensing and Sunday hunting copy against current PGC pages.
- eBird data needs written permission from Cornell for commercial use; hold the birdwatching section until that's settled.
