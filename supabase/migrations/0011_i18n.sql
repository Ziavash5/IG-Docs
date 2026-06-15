-- Multi-language support. English is the source of truth; other languages are AI-
-- translated and cached here, keyed by a hash of the English text so the cache
-- invalidates automatically when the English changes.
-- Run in Supabase -> SQL Editor. Safe to run more than once.

create table if not exists languages (
  slug        text primary key,            -- ISO-ish code: de, ja, fr, ...
  label       text not null,               -- English name: German, Japanese
  native_name text,                        -- endonym shown in the picker: Deutsch, 日本語
  created_at  timestamptz not null default now()
);

create table if not exists translations (
  lang        text not null,               -- target language slug
  kind        text not null default 's',   -- 's' short UI string, 'd' long document
  source_key  text not null,               -- hash of the English source text
  value       text not null,               -- the translation
  created_at  timestamptz not null default now(),
  primary key (lang, kind, source_key)
);

create index if not exists translations_lang_kind_idx on translations (lang, kind);
