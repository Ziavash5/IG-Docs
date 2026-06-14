-- Per-bucket rate limiting (public chat). Run in Supabase → SQL Editor.
create table if not exists rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket, window_start)
);
