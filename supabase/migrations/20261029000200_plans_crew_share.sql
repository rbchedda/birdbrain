drop policy plans_insert_own on public.plans;
drop policy plans_update_own on public.plans;
create policy plans_insert_own on public.plans for insert to authenticated
  with check (user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and (crew_id is null or (public.is_crew(crew_id) and public.is_group_member(crew_id))));
create policy plans_update_own on public.plans for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (crew_id is null or (public.is_crew(crew_id) and public.is_group_member(crew_id))));
-- Crew members read shared plans (feed line "[Name] is planning SGL 211 · Sat"); read-only.
create policy plans_select_crew on public.plans for select to authenticated
  using (crew_id is not null and public.is_group_member(crew_id));
