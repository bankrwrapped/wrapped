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
  -- USD columns: internal only, power leaderboard ranking (order by
  -- total_earnings_usd) - not necessarily returned to the frontend for display.
  creator_earnings_usd numeric not null default 0,
  please_bro_earnings_usd numeric not null default 0,
  total_earnings_usd numeric not null default 0,
  unclaimed_usd numeric not null default 0,
  -- ETH columns: what's actually displayed to users and on the leaderboard.
  creator_earnings_eth numeric not null default 0,
  please_bro_earnings_eth numeric not null default 0,
  total_earnings_eth numeric not null default 0,
  unclaimed_eth numeric not null default 0,
  payload jsonb not null,
  first_indexed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ranking stays USD-based per explicit decision, even though display is ETH
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
  fees_earned_eth numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists idx_wrapped_tokens_wallet
  on wrapped_tokens (wallet_address);
create index if not exists idx_wrapped_tokens_fees_eth
  on wrapped_tokens (fees_earned_eth desc);

-- ============================================================
-- Module 6: On-Chain Indexer — aggregated/tracking tables only.
-- Envio owns its own raw-event schema in a SEPARATE Postgres
-- instance (auto-generated from schema.graphql) — do not add
-- raw Swap/Release/Collect tables here. See playbook §4.
-- ============================================================

-- One row per contract this indexer watches. New rows (e.g. Clanker)
-- get added without a schema change.
create table if not exists indexed_contracts (
  id            bigserial primary key,
  chain         text not null check (chain in ('base', 'robinhood')),
  contract_type text not null,
  address       text not null,
  source        text not null check (source in ('doppler', 'clanker')),
  created_at    timestamptz not null default now(),
  unique (chain, contract_type, address)
);

-- Per-token identity + backfill/checkpoint status. Module 7 and
-- Module 9 read/write this — it does NOT store raw events.
create table if not exists indexed_tokens (
  token_address              text not null,
  chain                      text not null check (chain in ('base', 'robinhood')),
  pool_id                    text,
  source                     text not null check (source in ('doppler', 'clanker')),
  deployer_wallet            text,
  first_seen_block           bigint,
  decimals                   integer,
  backfill_status            text not null default 'pending'
                               check (backfill_status in ('pending', 'in_progress', 'complete', 'failed')),
  backfill_checkpoint_block  bigint,
  last_refreshed_at          timestamptz,
  primary key (chain, token_address)
);

-- Pre-aggregated per-token lifetime totals — what Module 7's provider
-- actually reads. Populated by Module 9's sync job against Envio's
-- GraphQL API, not by a live join against raw event tables.
create table if not exists token_volume_summary (
  chain            text not null check (chain in ('base', 'robinhood')),
  token_address    text not null,
  total_volume_usd numeric not null default 0,
  swap_count       integer not null default 0,
  last_updated_at  timestamptz not null default now(),
  primary key (chain, token_address)
);


-- Added by Module 5 (pricing service). Historical USD price cache, keyed by
-- hourly bucket - see priceCacheRepository.ts for bucketing rationale.
-- Module 6 may relocate/renumber this once real migration tooling lands;
-- kept idempotent (create if not exists) so it's safe either way.
create table if not exists price_cache (
  chain             text not null check (chain in ('base', 'robinhood')),
  token_address     text not null,
  timestamp_bucket  timestamptz not null,
  price_usd         numeric not null,
  created_at        timestamptz not null default now(),
  primary key (chain, token_address, timestamp_bucket)
);

-- Added by Module 7 (2026-08-08), filling a gap: walletBackfillRequestsRepository.ts
-- (Module 9, item 19) queries this table but it was never actually added to
-- schema.sql -- confirmed missing via direct grep, not assumed. Shape matches
-- the repository's real query exactly (wallet_address, chain, token_address,
-- unique constraint the repository's ON CONFLICT already assumes).
create table if not exists wallet_backfill_requests (
  wallet_address  text not null,
  chain           text not null check (chain in ('base', 'robinhood')),
  token_address   text not null,
  requested_at    timestamptz not null default now(),
  primary key (wallet_address, chain, token_address)
);
