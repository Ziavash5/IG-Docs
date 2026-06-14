-- Per-corridor content + editable corridors. Run in Supabase → SQL Editor.

-- Editable list of corridors (merged with the built-in defaults).
create table if not exists corridors (
  slug       text primary key,
  label      text not null,
  created_at timestamptz not null default now()
);

-- A unit is now unique per (corridor, slug), not globally per slug, so the same
-- question can have a different answer in each corridor.
alter table units drop constraint if exists units_slug_key;
create unique index if not exists units_corridor_slug_idx on units (corridor, slug);
