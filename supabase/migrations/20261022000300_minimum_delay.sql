-- Enforce a minimum delay on top of the next-day rule.
--
-- Leak fixed: a post at 11:59 PM became public at midnight, one minute
-- later, which is effectively live. Content now becomes public at the later
-- of midnight Eastern the next day and created + 12 hours. The minimum lives
-- in one function so it is easy to tune.

create function public.min_public_delay() returns interval
language sql immutable set search_path = '' as $$
  select interval '12 hours';
$$;

create or replace function public.public_after_for(ts timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select greatest(public.next_day_et(ts), ts + public.min_public_delay());
$$;

-- Re-time anything still waiting so the rule applies to it too.
update public.posts set public_after = public.public_after_for(created_at) where public_after > now();
update public.comments set public_after = public.public_after_for(created_at) where public_after > now();
