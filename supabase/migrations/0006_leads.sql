-- Lead capture from the chat funnel. Run in Supabase → SQL Editor.
create table if not exists leads (
  id          bigint generated always as identity primary key,
  name        text,
  email       text,
  company     text,
  corridor    text,
  question    text,
  transcript  text,
  created_at  timestamptz not null default now()
);
