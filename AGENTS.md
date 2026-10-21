# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Backend tests need no Docker: `npm run db:test` and `node --test 'ingest/*.test.mjs'` run every migration in PGlite + PostGIS (`supabase/tests/db.mjs`). The app has its own suite and conventions in `app/AGENTS.md`.
- Never point ingestion at a hosted database while testing; verify against PGlite. Ingest jobs only touch a real DB when `DATABASE_URL` is set.
- PGC sources drift: before trusting a field mapping, run `npm run ingest:describe` (flags mapped fields missing upstream) and refresh `ingest/fixtures/` from the live data. See README "Ingestion" for source quirks and the PGC attribution terms.
- Migrations are append-only: add a new `supabase/migrations/<timestamp>_*.sql` file rather than editing an applied one.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
