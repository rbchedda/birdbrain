-- Rollback for 20261028000000_notice_acknowledgements.sql (drops the log and its rows).
drop table if exists public.notice_acknowledgements;
