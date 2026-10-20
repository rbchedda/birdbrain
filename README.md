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

Privacy model: a post's exact location is stored in `post_locations`, which only
the author can read. Everyone else sees `posts.blurred_geom`, a trigger-derived
point snapped to a ~5 km grid. Saved posts and saved spots are owner-only.

## Ingestion

`ingest/game-lands.mjs` pulls all State Game Lands polygons (309 as of the
2023-01 PASDA layer) and upserts them into `places`. Re-runs are safe, and SGLs
removed from the source are deleted.

```sh
DATABASE_URL=postgres://postgres:...@db.<ref>.supabase.co:5432/postgres npm run ingest:game-lands
node ingest/game-lands.mjs --out data/raw/game-lands.geojson   # fetch only
```

The script is plain Node, so n8n can run it from an Execute Command node on a
schedule, or the same steps can be rebuilt as HTTP Request + Postgres nodes.

## Open items

- Check PASDA / PGC terms of use for the game lands layer (the dataset summary
  page states none).
- The PASDA layer was last modified in January 2023; compare it with the PGC
  Mapping Center for newer boundaries.
- Pheasant stocking and dove field ingestion (no API found; scrape or enter by hand each fall).
- Verify migratory bird licensing and Sunday hunting copy against current PGC pages.
