# BirdBrain hosted Supabase plan: DRY RUN, nothing applied
Project: ipvcrygkulrwopgtdkwd (https://ipvcrygkulrwopgtdkwd.supabase.co). Repo dev @ c7e6b90. CLI 2.121.0 at ~/.local/bin/supabase.
Status: there was no SUPABASE_ACCESS_TOKEN when this was prepped (2026-10-21 ~9 PM ET), so the read-only checks below have NOT run yet.

## 0. Read-only checks (run once the token exists)
    export PATH=~/.local/bin:~/node22/bin:$PATH
    H="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"; R=ipvcrygkulrwopgtdkwd
    curl -fsS -H "$H" https://api.supabase.com/v1/projects/$R | jq '{status,region,database:.database.version}'   # expect ACTIVE_HEALTHY, PG 17.x
    curl -fsS -H "$H" -X POST https://api.supabase.com/v1/projects/$R/database/query \
      -H 'content-type: application/json' -d '{"query":"select name,default_version,installed_version from pg_available_extensions where name in (\"postgis\",\"pgcrypto\",\"uuid-ossp\")"}'
    curl -fsS -H "$H" https://api.supabase.com/v1/projects/$R/api-keys | jq -r '.[]|.name'          # list key NAMES only
    curl -fsS -H "$H" https://api.supabase.com/v1/projects/$R/config/auth | jq '{site_url,uri_allow_list,external_email_enabled,mailer_autoconfirm,external_anonymous_users_enabled}'
    scripts/write-app-env.sh     # writes app/.env (anon key only; refuses service_role/sb_secret)
Note: database/query is a read here (a SELECT), but the same endpoint can write. Only send SELECTs.

## 1. Migrations, in apply order (supabase/migrations)
- 20261019000000_initial_schema.sql
- 20261019000100_storage.sql
- 20261021000000_delay_moderation_ingest.sql
- 20261021000100_stocking_allocation.sql
- 20261021120000_post_place_counts.sql
- 20261022000000_comment_delay.sql
- 20261022000100_lock_public_post_edits.sql
- 20261022000200_gate_post_photo_reads.sql
- 20261022000300_minimum_delay.sql
- 20261023000000_account_deletion.sql
- 20261023000100_moderation_e2e.sql
- 20261023000200_guest_reports_no_autohide.sql
- 20261024000000_place_counties.sql
- 20261024000100_hunt_log.sql
- 20261024000200_diary_entries.sql
- 20261024000300_diary_update_ownership.sql
Apply with: `supabase link --project-ref $R` then `supabase db push --dry-run`, then `supabase db push` only once it's approved.
Extensions: only **postgis**, created by the initial migration (`create extension if not exists postgis with schema extensions`). It's available on hosted, and the migration enables it, so it doesn't need to be enabled first. No pg_cron, pg_net or vault. Ingest (ingest/arcgis.mjs) is a separate Node job, not part of the DB.

## 2. Storage
- Buckets created by SQL insert into storage.buckets (works on hosted): `post-photos` (private, 20261019000100) and `diary-photos` (private, 20261024000200).
- Policies on storage.objects: post-photos owner upload and delete under `<uid>/`; reads gated to own photos or photos of visible posts (20261022000200); diary-photos owner-only select, insert, update and delete.
- No file-size or MIME limits are set on the buckets. Consider setting a limit (e.g. 10 MB, image/*) in the dashboard.

## 3. PGlite stub and hosted differences
- supabase/tests/supabase-stub.sql fakes the auth/storage schemas and roles. Hosted has the real ones, so the migrations' CREATE POLICY on storage.objects and the triggers on auth.users (on_auth_user_created; the guest-report trigger reads auth.users.is_anonymous) should apply as the `postgres` role. Verify in the dry-run.
- **Direct `delete from storage.objects`** in delete_my_account (20261023000000, redefined in 20261024000200) is refused on hosted (storage.protect_delete). It's wrapped in `begin … exception when others` and downgraded to a warning. The client already removes files via the Storage API first (PR #18), so it doesn't block anything. Verify end to end on hosted.
- `delete from auth.users` inside a SECURITY DEFINER function owned by postgres is allowed on hosted. Verify by deleting a test account.
- The tests only ever ran on PGlite. Nothing has run against a real PostgREST or Storage yet.

## 4. Auth settings (dashboard or Management API PATCH /config/auth, after approval)
- Email+password sign-up is ON. Decide on email confirmation: the app handles `needsConfirmation`, so leave confirm ON.
- **Anonymous sign-ins: the app calls signInAnonymously (guest mode), but config.toml has enable_anonymous_sign_ins=false.** Enable it on hosted, or guest mode fails. Turn on the CAPTCHA/rate limit for anon.
- Site URL and redirect allow-list: `birdbrain://**` (app.json scheme) plus `exp://**` for Expo Go/dev. Add web if a web build ships.
- The default SMTP is rate-limited (a few emails per hour). Custom SMTP is needed before the beta.
- Apple sign-in is not configured (it needs the Apple Developer account).

## 5. RLS verification afterward (anon key + two test users A and B)
Tables with RLS: blocklist_terms comments counties diary_entries dogs group_members groups hunt_log_entries ingest_state likes places post_locations post_place_counts posts profiles reports saved_places saves species_prefs stocking_events stocking_properties user_blocks. Views (security_invoker): stocking_county_totals, place_stocking_county.
1. Run `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and not relrowsecurity;` and expect 0 rows.
2. Anon (REST with the anon key): reference data that's meant to be public (places, counties, stocking_*, the views) is readable. Every user table (hunt_log_entries, diary_entries, dogs, saves, saved_places, species_prefs, user_blocks, reports, ingest_state, blocklist_terms) returns [] or 401. Inserts on any table fail.
3. A vs B: A's hunt log, diary, dogs and saves are invisible to B. B can't update or repoint A's diary_entry (20261024000300). A post younger than its public_after delay is hidden from B. A blocked user sees nothing. A comment from a guest doesn't auto-hide posts.
4. Storage: anon can't list or download either bucket. B can't read A's diary-photos/<A>/… or upload into A's folder. B can read A's post photo only when the post is visible.
5. Delete account A: the Storage API removes the files, then rpc delete_my_account. Check that the auth user, rows and objects are gone, and that A's groups now have created_by null.
6. Anon role can't execute delete_my_account (revoked).
Script these against the hosted URL by reusing supabase/tests cases with supabase-js. Use the service_role key only on the box, never in app/.env.

## 6. Needed from RBChedda
1. **Supabase personal access token** (SUPABASE_ACCESS_TOKEN), required for every check above.
2. **Database password**, required for `supabase db push`. The token covers link and the Management API, but db push connects to Postgres directly and asks for the password (SUPABASE_DB_PASSWORD) unless it's provided. If it's lost, reset it in Dashboard → Database settings.
3. Approval to run db push and to change the auth config (anonymous sign-ins on, redirect URLs, confirm-email choice).
4. The anon key isn't needed separately if the token exists (the script fetches it), and neither is the region (the API reports it).
5. Later: an SMTP provider, and the Apple, Expo and Sentry accounts.
