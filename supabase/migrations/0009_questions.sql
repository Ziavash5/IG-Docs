-- Reader Q&A loop. Run in Supabase. Visitors ask a question on a guide; the operator
-- answers and publishes it, which appends fresh long-tail Q&A to that guide page.
create table if not exists questions (
  id         bigint generated always as identity primary key,
  corridor   text not null,
  unit_slug  text not null,
  question   text not null,
  answer     text,
  email      text,
  status     text not null default 'pending',  -- pending | published
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists questions_published_idx
  on questions (corridor, unit_slug) where status = 'published';
