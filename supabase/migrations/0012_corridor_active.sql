-- Per-corridor lock/unlock. A corridor is "active" (live and selectable on the public
-- site) or locked ("coming soon"). Built-in corridors default per lib/content.ts; the
-- operator can override here once a corridor's content is ready.
-- Run in Supabase -> SQL Editor. Safe to run more than once.

alter table corridors add column if not exists active boolean not null default true;
