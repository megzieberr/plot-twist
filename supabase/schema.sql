-- Plot Twist schema. Run this once in the Supabase SQL editor.
-- Single-user app: RLS is on, and any authenticated user (i.e. you) has access.
-- Remember: Authentication -> Providers -> Email -> "Confirm email" OFF,
-- then create the user (synthetic email megzieberr@plottwist.local + password)
-- under Authentication -> Users -> Add user.

create table if not exists titles (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('movie', 'series', 'anime')),
  external_source text not null default 'manual' check (external_source in ('tmdb', 'anilist', 'manual')),
  external_id text,
  title text not null,
  year int,
  poster_url text,
  overview text default '',
  genres text[] not null default '{}',   -- raw API genres
  keywords text[] not null default '{}', -- raw API keywords / AniList tags
  axes text[] not null default '{}',     -- custom taste-axis tags
  flags text[] not null default '{}',    -- negative flags (slow_pacing, addiction_central, ...)
  created_at timestamptz not null default now()
);

-- Partial unique index (a plain UNIQUE constraint would treat NULL external_ids as distinct anyway,
-- but manual titles have no external_id, so scope the uniqueness to API-sourced rows).
create unique index if not exists titles_external_key
  on titles (external_source, external_id, media_type)
  where external_id is not null;

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references titles (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'series', 'anime')),
  verdict text not null check (verdict in ('liked', 'disliked', 'meh', 'watchlist', 'avoid', 'interested', 'skipped')),
  note text default '',
  created_at timestamptz not null default now()
);

create index if not exists ratings_title_idx on ratings (title_id);

-- key/value store for scorer weights (so logistic-regression weights can be persisted later)
create table if not exists settings (
  key text primary key,
  value jsonb
);

alter table titles enable row level security;
alter table ratings enable row level security;
alter table settings enable row level security;

-- Single-user policies: any authenticated session (only you can log in).
create policy "authed all titles" on titles for all
  to authenticated using (true) with check (true);
create policy "authed all ratings" on ratings for all
  to authenticated using (true) with check (true);
create policy "authed all settings" on settings for all
  to authenticated using (true) with check (true);
