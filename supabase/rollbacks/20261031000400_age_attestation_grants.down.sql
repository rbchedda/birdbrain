revoke insert (user_id, min_age, method) on public.age_attestations from authenticated;
grant insert on public.age_attestations to authenticated;
