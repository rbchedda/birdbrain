-- Audit low: authenticated-rpc-is_blocked_between-oracle (+ contains_objectionable).
-- Rollback: supabase/rollbacks/20261031000000_definer_helper_lockdown.down.sql
--
-- is_blocked_between(a, b) is SECURITY DEFINER and was callable by any signed-in
-- user over /rpc for any pair, leaking private user_blocks rows. It can't simply
-- lose EXECUTE: can_see_post() (SECURITY INVOKER) and the comments policy call it
-- as the authenticated role. Every caller passes auth.uid() as one side, so the
-- function now answers only when the caller is one of the two parties; for any
-- other pair it returns false. Third parties learn nothing.
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and (select auth.uid()) in (a, b)
     and exists (
       select 1 from public.user_blocks
        where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
     );
$$;

-- contains_objectionable(t) let clients probe the private blocklist term by term.
-- Its only caller is reject_objectionable(), a trigger function; make that run as
-- the owner so authenticated no longer needs EXECUTE on the helper.
alter function public.reject_objectionable() security definer;
revoke execute on function public.contains_objectionable(text) from public, anon, authenticated;
