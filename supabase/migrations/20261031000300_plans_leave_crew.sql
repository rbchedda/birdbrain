-- Audit low: plans-crew-share-persists-after-leaving.
-- Rollback: supabase/rollbacks/20261031000300_plans_leave_crew.down.sql
-- plans and plans_crew_share are already applied on hosted (migration-log.md).
--
-- When a member leaves (or is removed from) a crew, their plans shared with that
-- crew are unshared (crew_id -> null). The read policy also requires the plan's
-- owner to still be a member, so any row the trigger missed stays unreadable.
create function public.unshare_plans_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.plans set crew_id = null, updated_at = now()
   where user_id = old.user_id and crew_id = old.group_id;
  return null;
end;
$$;
revoke execute on function public.unshare_plans_on_leave() from public, anon, authenticated;
create trigger group_members_unshare_plans after delete on public.group_members
  for each row execute function public.unshare_plans_on_leave();

-- Existing rows whose owner already left.
update public.plans p set crew_id = null
 where p.crew_id is not null
   and not exists (select 1 from public.group_members m where m.group_id = p.crew_id and m.user_id = p.user_id);

drop policy plans_select_crew on public.plans;
create policy plans_select_crew on public.plans for select to authenticated
  using (crew_id is not null
    and public.is_group_member(crew_id)
    and exists (select 1 from public.group_members m where m.group_id = plans.crew_id and m.user_id = plans.user_id));
