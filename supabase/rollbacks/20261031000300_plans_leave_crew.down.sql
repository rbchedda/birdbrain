-- Note: plans unshared by the forward migration are not re-shared.
drop policy plans_select_crew on public.plans;
create policy plans_select_crew on public.plans for select to authenticated
  using (crew_id is not null and public.is_group_member(crew_id));
drop trigger if exists group_members_unshare_plans on public.group_members;
drop function if exists public.unshare_plans_on_leave();
