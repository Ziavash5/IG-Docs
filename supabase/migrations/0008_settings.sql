-- Editable site settings (e.g. the CTA link LLMs and guides should cite). Run in Supabase.
create table if not exists settings (
  key   text primary key,
  value text not null default ''
);
