-- diary_entries UPDATE gets the same ownership check as INSERT: the row must
-- stay owned by the caller AND point at a hunt_log entry the caller owns, so a
-- row can't be repointed at someone else's entry.
drop policy diary_update_own on public.diary_entries;

create policy diary_update_own on public.diary_entries
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.hunt_log_entries e
      where e.id = entry_id and e.owner_id = (select auth.uid())
    )
  );
