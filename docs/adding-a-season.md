# Adding a PA hunting season (e.g. 2027-28)

BirdBrain only knows seasons listed in `SEASONS` (`app/src/data/seasonRegistry.ts`). A season year runs **Jul 1 – Jun 30**. Any date in an unlisted year is **unpublished**, and the app shows:

> 2027-28 dates not published yet. Check the PGC hunting digest.

In that state it never shows "Closed" or "Out of season". Plans can still be saved, with an "Unverified dates" note. The Guide shows last season's rules, labelled "2026-27 (last season)".

`app/src/__tests__/seasonExpiryGuard.test.ts` fails in CI when the date 60 days from today has no season. That happens around **May** each year until the next season is added. The failure is intended: it's the reminder to add the next season.

**Never invent or extrapolate dates.** Add a season only from PGC's published digest or seasons page.

## Checklist

1. **Data file.** Copy `app/src/data/seasonSets/2026-27.ts` to `app/src/data/seasonSets/<year>.ts` and fill in every field from the new digest:
   - `year`: for example `'2027-28'`.
   - `digestUrl`: the new digest PDF.
   - `seasons`: one entry per species and segment. `windows` is a list of inclusive `[start, end]` YMD pairs. Use `null` when dates vary by WMU or zone. Mark junior/mentored segments `youth: true`, and cite the digest page in a comment.
   - `springNoonUntil`: the last noon-close day for spring gobbler.
   - `seParkSundays`: the Sundays SE state parks and preserves allow hunting (digest p.4).
   - `fallTurkey`: `{ open, firstClose, lastClose }` across WMUs.
2. **Register it.** Import the set in `seasonRegistry.ts` and add `'<year>': set` to `SEASONS`.
3. **Regs and copy.** Bump `REGS.version`, `asOf` and `season` in `app/src/data/regs.ts`, then review the bag limits, Sunday notes and `NO_FALL_TURKEY_WMUS`. Also review year-specific copy in `data/gear.ts` (`GEAR_VERSION`), `data/birds.ts` (`regsNote`) and `data/guide.ts` (`SPRING_GOBBLER_HOURS`).
4. **Stocking.** The pheasant allocation (`app/src/data/pgcStocking.json`, `season`) is a separate PGC publication. Refresh it with `ingest/stocking_windows.mjs` and `scripts/sync-stocking.mjs` once PGC posts it. Until then the app labels last season's weeks and says the new ones aren't published.
5. **Hours table.** `app/src/data/huntingHours.json` covers 2025-01-01 to 2035-12-31. Only refresh it if `last` is near.
6. **Terms/notice.** If the map notice or terms text changed, bump `TERMS_VERSION` / `NOTICE_VERSION` (product decision).
7. **Tests.**
   - `npx jest seasonRegistry`: the new set must sit inside its Jul 1 – Jun 30 with no overlaps.
   - `npx jest seasonExpiryGuard`: should pass again.
   - Add a parity fixture for the new year only if you refactor season code later (see `seasonParity.test.ts`). Don't regenerate the 2026-27 fixture.
   - Run the audit harness at a date inside the new season and one after it:
     `SEASON_AUDIT_DIR=/tmp/season-audit SEASON_AUDIT_DATES=2027-09-15,2028-07-01 npx jest seasonExpiry.audit`
   - Then run the full suite: `env -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_ANON_KEY -u EXPO_PUBLIC_FIELDTEST_UNLOCK npx jest`, plus `npx tsc --noEmit`.
8. **PR.** List each date's digest page in the PR description so a reviewer can verify them.
