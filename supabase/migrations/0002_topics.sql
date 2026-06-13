-- Editable curriculum. Run this in Supabase → SQL Editor after the initial schema.
-- A "topic" is one question in the curriculum (the thing you add/remove/edit, and the
-- thing the writer generates content for). Generated content still lives in `units`,
-- keyed by the topic slug.

create table if not exists topics (
  id          text primary key,
  stage       text not null,                 -- enter | operate | thrive
  pillar_slug text not null,                  -- maps to a pillar in lib/content.ts
  slug        text not null unique,
  title       text not null,                  -- short nav label
  question    text not null,                  -- the long-tail question
  risk_tier   text not null check (risk_tier in ('factual','interpretive')),
  position    int not null default 0,         -- ordering within a pillar
  created_at  timestamptz not null default now()
);

create index if not exists topics_pillar_idx on topics(pillar_slug);

-- Allow 'planned' as a unit status (a topic with no generated content yet).
alter table units drop constraint if exists units_status_check;
alter table units add constraint units_status_check
  check (status in ('planned','draft','in_review','published'));

-- Generated topics may not have a review date yet.
alter table units alter column last_reviewed drop not null;
