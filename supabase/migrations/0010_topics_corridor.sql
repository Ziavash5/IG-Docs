-- Make the curriculum per-corridor. Previously `topics` was global (slug unique across
-- the whole table), so adding, editing, reordering, or DELETING a topic in one corridor
-- changed every corridor, and deleting topics orphaned other corridors' generated units.
-- Each corridor now owns its own topic set; the same slug may exist in several corridors.
--
-- Run this in Supabase -> SQL Editor. It is safe to run more than once.

alter table topics add column if not exists corridor text not null default 'germany';

-- Drop the old global-unique-on-slug constraint (named topics_slug_key by the original
-- `slug text not null unique`) and replace it with uniqueness per (corridor, slug).
alter table topics drop constraint if exists topics_slug_key;
drop index if exists topics_slug_key;
create unique index if not exists topics_corridor_slug_idx on topics (corridor, slug);
create index if not exists topics_corridor_idx on topics (corridor);
