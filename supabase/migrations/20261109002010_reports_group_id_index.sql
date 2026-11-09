-- Live performance advisor: reports.group_id is an unindexed FK
-- (the partial unique index reports_one_open_per_group is on
-- (reporter_id, group_id) WHERE status = 'open', which does not cover
-- the FK). A plain btree on group_id supports group deletes and lookups.
-- Rollback: supabase/rollbacks/20261109002010_reports_group_id_index.down.sql

create index if not exists reports_group_id_idx on public.reports (group_id);
