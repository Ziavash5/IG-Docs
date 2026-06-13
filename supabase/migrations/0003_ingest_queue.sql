-- Resumable ingestion + custom sources. Run in Supabase → SQL Editor.

-- Sources you add yourself from the console (merged with the built-in registry).
create table if not exists custom_sources (
  id           text primary key,
  body         text not null,
  url          text not null,
  corridor     text not null,
  crawl_prefix text,
  crawl_max    int,
  created_at   timestamptz not null default now()
);

-- Crawl frontier: each Ingest click processes a small batch of pending URLs, so a
-- deep source ingests across several clicks instead of one timing-out request.
create table if not exists ingest_queue (
  id         bigint generated always as identity primary key,
  source_id  text not null,
  url        text not null,
  status     text not null default 'pending',  -- pending | done
  created_at timestamptz not null default now(),
  unique (source_id, url)
);
create index if not exists ingest_queue_pending_idx
  on ingest_queue (source_id) where status = 'pending';
