drop table if exists public.plans;          -- data lost; plans also live in the on-phone queue until synced
drop function if exists public.plans_touch();
delete from supabase_migrations.schema_migrations where version='20261029000100';
