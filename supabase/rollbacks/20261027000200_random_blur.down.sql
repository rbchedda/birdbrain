-- Restores the hosted definitions captured 2026-10-23.
create or replace function public.guard_post_blurred_geom()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.blurred_geom := null;
  elsif new.location_visibility = 'hidden' then
    new.blurred_geom := null;
  else
    new.blurred_geom := (
      select public.blur_point(l.geom) from public.post_locations l where l.post_id = new.id
    );
  end if;
  return new;
end;
$function$;
create or replace function public.sync_post_blurred_geom()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts p
     set blurred_geom = case
       when tg_op = 'DELETE' or p.location_visibility = 'hidden' then null
       else public.blur_point(new.geom)
     end
   where p.id = target;
  return null;
end;
$function$;
update public.posts p set blurred_geom = public.blur_point(l.geom)
  from public.post_locations l where l.post_id = p.id and p.location_visibility <> 'hidden';
drop function if exists public.blur_point_keyed(extensions.geometry, uuid);
drop table if exists private.blur_salt;
drop schema if exists private;
