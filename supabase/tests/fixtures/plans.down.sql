-- TEST FIXTURE ONLY. Verbatim copy of /workspace/hosted-changes-needed.md §2 rollback ().
-- Not a migration: the engineer commits the real plans migrations separately. Keep in sync.
drop table if exists public.plans;          -- data lost; plans also live in the on-phone queue until synced
drop function if exists public.plans_touch();
