drop policy plans_select_crew on public.plans;
update public.plans set crew_id = null where crew_id is not null;
drop policy plans_insert_own on public.plans;
drop policy plans_update_own on public.plans;
create policy plans_insert_own on public.plans for insert to authenticated
  with check (user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and crew_id is null);
create policy plans_update_own on public.plans for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and crew_id is null);
delete from supabase_migrations.schema_migrations where version='20261029000200';
