-- Corridor Authority Engine — initial schema for Supabase Postgres.
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Mirrors docs/architecture.md (Data stores) and lib/question-unit.ts.

-- 1. pgvector for embeddings.
create extension if not exists vector;

-- 2. Official sources (registry; see docs/sources.md). Official bodies only.
create table if not exists sources (
  id            text primary key,            -- e.g. 'fin-ca-de-treaty'
  body          text not null,               -- issuing body
  url           text not null,               -- canonical URL / section
  corridor      text not null,               -- base | dach | uk | ...
  last_checked  timestamptz                  -- freshness loop
);

-- 3. Ingested chunks with embeddings (Voyage voyage-3 = 1024 dims).
create table if not exists chunks (
  id          bigint generated always as identity primary key,
  source_id   text not null references sources(id) on delete cascade,
  text        text not null,
  locator     text not null,                 -- URL + anchor/section for citation
  embedding   vector(1024)
);
-- Cosine similarity index for retrieval.
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_source_idx on chunks(source_id);

-- 4. Question-units.
create table if not exists units (
  id                  text primary key,
  slug                text unique not null,
  question            text not null,
  pillar              smallint not null check (pillar between 1 and 7),
  layer               text not null check (layer in ('base','overlay')),
  corridor            text not null,
  jurisdictions       text[] not null default '{}',
  risk_tier           text not null check (risk_tier in ('factual','interpretive')),
  status              text not null default 'draft'
                        check (status in ('draft','in_review','published')),
  author_name         text,
  author_credentials  text,
  last_reviewed       date not null,
  cta                 text,
  body                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 5. Claims — every factual assertion, bound to a source. No source span, no claim.
create table if not exists claims (
  id          bigint generated always as identity primary key,
  unit_id     text not null references units(id) on delete cascade,
  text        text not null,
  source_id   text not null references sources(id),
  locator     text not null,
  verified    boolean not null default false
);
create index if not exists claims_unit_idx on claims(unit_id);

-- 6. Review queue — only the high-judgment minority reaches the operator.
create table if not exists review_queue (
  id          bigint generated always as identity primary key,
  unit_id     text not null references units(id) on delete cascade,
  reason      text not null,                 -- 'interpretive' | 'verification-disagreement'
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists review_queue_open_idx
  on review_queue(resolved_at) where resolved_at is null;
