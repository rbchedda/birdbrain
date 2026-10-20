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
