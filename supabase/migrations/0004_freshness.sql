-- Freshness tracking. Run in Supabase → SQL Editor.
-- A content hash of each source's seed page, so we can detect when an official source
-- changes and flag the units that cite it for re-review.
alter table sources add column if not exists content_hash text;
