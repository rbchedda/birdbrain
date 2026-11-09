-- Repo L8: clients must not set audit/server columns on profiles
-- (rules_accepted_at, onboarded_at, created_at, updated_at, id). The app
-- (app/src/data/supabaseBackend.ts updateProfile) only writes username,
-- display_name, and has_dog. rules acceptance stays on accept_community_rules().
-- avatar_path and home_state exist but are not written by the app today, so
-- they are not granted.
-- Rollback: supabase/rollbacks/20261109002005_profiles_column_grants.down.sql

revoke update on public.profiles from public, anon, authenticated;
grant update (username, display_name, has_dog) on public.profiles to authenticated;
