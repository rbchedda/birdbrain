-- Not a faithful restore: the previous keyed-blur salt and historically
-- blurred points are gone. Re-apply 20261027000200 + 20261109001000 from
-- a backup if a true rollback is required. This file documents that.
--
-- Do not run this against hosted as a substitute for those migrations.
select 1;
