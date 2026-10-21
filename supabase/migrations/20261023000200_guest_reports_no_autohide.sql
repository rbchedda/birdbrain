-- Guest (anonymous) reports don't count toward the auto-hide threshold.
--
-- Supabase marks anonymous sign-ins with auth.users.is_anonymous (also exposed
-- as the is_anonymous claim in auth.jwt()). The schema has no profile flag, so
-- the trigger checks auth.users for every reporter: guests are cheap to mint,
-- and letting three of them hide any post would be an abuse vector. Guest
-- reports are still stored for moderators to review.

create or replace function public.hide_reported_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if new.post_id is not null then
    select count(distinct r.reporter_id) into n
      from public.reports r join auth.users u on u.id = r.reporter_id
     where r.post_id = new.post_id and r.status = 'open' and not coalesce(u.is_anonymous, false);
    if n >= public.moderation_report_threshold() then
      update public.posts set hidden_at = now() where id = new.post_id and hidden_at is null;
    end if;
  elsif new.comment_id is not null then
    select count(distinct r.reporter_id) into n
      from public.reports r join auth.users u on u.id = r.reporter_id
     where r.comment_id = new.comment_id and r.status = 'open' and not coalesce(u.is_anonymous, false);
    if n >= public.moderation_report_threshold() then
      update public.comments set hidden_at = now() where id = new.comment_id and hidden_at is null;
    end if;
  end if;
  return new;
end;
$$;
