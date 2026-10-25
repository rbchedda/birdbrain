-- Woodcock becomes a species the hunt log and diary can save.
-- Repo-only until a human applies it to the hosted project (hosted-changes-needed.md).
-- The client keeps woodcock logging behind EXPO_PUBLIC_FLAG_WOODCOCK_LOG until then.
alter type public.species add value if not exists 'woodcock';

create or replace function public.valid_diary_details(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(d) = 'object'
    and coalesce((d ->> 'hours')::numeric, 0) between 0 and 24
    and coalesce((d ->> 'miles')::numeric, 0) between 0 and 100
    and coalesce((d ->> 'flushes')::numeric, 0) >= 0
    and coalesce((d ->> 'shots')::numeric, 0) >= 0
    and (d ->> 'startTime' is null or d ->> 'startTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    and coalesce(jsonb_typeof(d -> 'cover'), 'array') = 'array'
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(d -> 'cover', '[]'::pg_catalog.jsonb)) c
      where c not in ('grass', 'cut_corn', 'standing_corn', 'brush', 'young_forest', 'timber', 'marsh', 'field_edge')
    )
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(d -> 'species', '[]'::pg_catalog.jsonb)) s
      where s not in ('pheasant', 'dove', 'turkey', 'grouse', 'waterfowl', 'woodcock')
    )
$$;
