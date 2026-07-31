-- Run this once against the Railway Postgres instance:
--   psql "$DATABASE_URL" -f apps/api/db/schema.sql
-- (or paste it into Railway's built-in query console)

create table if not exists wrapped_profiles (
  wallet_address text primary key,
  username text not null,
  platform text not null check (platform in ('x', 'farcaster')),
  display_name text not null,
  avatar_url text not null,
  tokens_launched integer not null default 0,
  please_bro_count integer not null default 0,
  creator_earnings_usd numeric not null default 0,
  please_bro_earnings_usd numeric not null default 0,
  total_earnings_usd numeric not null default 0,
  unclaimed_usd numeric not null default 0,
  payload jsonb not null,
  first_indexed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- powers the marketing / partnership "top traders" leaderboard
create index if not exists idx_wrapped_profiles_total_earnings
  on wrapped_profiles (total_earnings_usd desc);

create index if not exists idx_wrapped_profiles_username
  on wrapped_profiles (lower(username));

create table if not exists wrapped_tokens (
  id bigserial primary key,
  wallet_address text not null references wrapped_profiles(wallet_address) on delete cascade,
  token_address text not null,
  name text not null,
  symbol text not null,
  chain text not null check (chain in ('base', 'robinhood')),
  category text not null check (category in ('launched', 'please_bro')),
  volume_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_wrapped_tokens_wallet
  on wrapped_tokens (wallet_address);

-- powers "top tokens" queries for marketing
create index if not exists idx_wrapped_tokens_volume
  on wrapped_tokens (volume_usd desc);