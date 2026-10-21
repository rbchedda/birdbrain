-- Comments get their own delay.
--
-- Leak fixed: once a post was public, a comment on it ("just flushed two more
-- by the cut corn, still there") was visible to everyone instantly, which
-- bypassed the next-day rule. Each comment now carries its own public_after,
-- set on insert from the comment's own creation time. Authors always see their
-- own comments; everyone else sees them after the delay.

-- One place that decides when content created at ts becomes public. Posts and
-- comments both use it so later rule changes apply to both.
create function public.public_after_for(ts timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select public.next_day_et(ts);
$$;

create or replace function public.set_post_public_after() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.public_after := public.public_after_for(new.created_at);
  return new;
end;
$$;

alter table public.comments add column public_after timestamptz;
update public.comments set public_after = public.public_after_for(created_at);
alter table public.comments alter column public_after set not null;
create index comments_post_public_idx on public.comments (post_id, public_after);

create function public.set_comment_public_after() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.public_after := public.public_after_for(new.created_at);
  return new;
end;
$$;

create trigger comments_set_public_after before insert on public.comments
  for each row execute function public.set_comment_public_after();

-- Clients may only supply these columns; created_at/public_after are trigger-owned.
revoke insert, update on public.comments from anon, authenticated;
grant insert (post_id, author_id, body) on public.comments to authenticated;

drop policy "comments are visible on visible posts, unless blocked" on public.comments;
create policy "comments are visible after their own delay, unless blocked" on public.comments
  for select to authenticated
  using (
    public.can_see_post_id(post_id)
    and (
      author_id = auth.uid()
      or (public_after <= now() and not public.is_blocked_between(auth.uid(), author_id))
    )
  );
