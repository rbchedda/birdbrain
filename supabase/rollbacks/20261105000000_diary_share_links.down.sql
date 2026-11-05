-- Rollback diary share links (feat/diary-share-link).

drop function if exists public.report_shared_diary(text, text, text, text);
drop table if exists public.public_share_reports;
drop function if exists public.record_share_link_view(text, text, text);
drop function if exists public.share_link_user_agent_is_bot(text);
drop function if exists public.purge_share_link_abuse_logs(interval);
drop table if exists public.share_link_abuse_logs;
drop table if exists public.share_link_view_counts;
drop function if exists public.share_link_view_counts_enabled();
drop function if exists public.read_crew_shared_diary(text);
drop function if exists public.read_shared_diary(text);
drop function if exists public.public_diary_share_enabled();
drop function if exists public.diary_share_status(uuid);
drop function if exists public.revoke_diary_share_link(uuid);
drop function if exists public.create_public_diary_share_link(uuid, integer);
drop function if exists public.create_diary_share_link(uuid, uuid, integer);
drop function if exists public.share_link_is_active(timestamptz, timestamptz);
drop function if exists public.diary_share_live_at(date, timestamptz);
drop function if exists public.guard_share_link_immutable();
drop table if exists public.share_links;
