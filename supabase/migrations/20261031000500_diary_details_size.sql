-- Audit (no-visible-quotas-or-rate-limits): cap diary_entries.details size.
-- Rollback: supabase/rollbacks/20261031000500_diary_details_size.down.sql
-- 16 KB of JSON text is far above a real entry (the app caps notes at 2000 chars and
-- photos are paths, not bytes). NOT VALID: existing rows are not re-checked, so the
-- migration can't fail on hosted data; every new insert/update is checked.
alter table public.diary_entries add constraint diary_details_size
  check (octet_length(details::text) <= 16384) not valid;
