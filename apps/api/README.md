# apps/api

Backend for Bankr Wrapped. Bun, raw `Bun.serve` (no framework).

## What it does

- Serves `GET /api/wrapped/:handle` — the assembled Wrapped payload (tokens, earnings, trading volume, claimable fees)
- X OAuth (login, callback, session cookies)
- Trading volume computation (on-chain indexer data, priced via GoldRush/Covalent, with a GeckoTerminal fallback)
- Creator earnings breakdown (Doppler + Clanker fee events)
- Bankr Bot webhook — notifies a user via Bankr's automation layer once their Wrapped finishes computing
- Public leaderboard (`GET /api/leaderboard`)

## Stack

- Bun (`Bun.serve`, hand-rolled routing — no Express/Fastify/Hono)
- Postgres (Railway) — sessions, cached Wrapped payloads, indexed-token metadata, price cache
- Reads on-chain data via GraphQL from `apps/indexer-base` / `apps/indexer-robinhood`'s Envio/Hasura endpoints — never touches their Postgres directly

## Required env vars

```
DATABASE_URL
GOLDRUSH_API_KEY
BASE_RPC_URL
ENVIO_GRAPHQL_URL
X_CLIENT_ID
X_CLIENT_SECRET
X_REDIRECT_URI
SESSION_ENC_KEY       # openssl rand -hex 32
```

All required — the app fails fast on boot if any are missing.

## Setup

```bash
bun install
psql "$DATABASE_URL" -f db/schema.sql   # run migrations
bun run dev
```

## Notes

- Trading volume is never blocking — first request returns a pending state immediately; a background job computes the real number and a later request (or a webhook push) surfaces it.
- CORS is an explicit origin allowlist (not `*`) since auth uses credentialed cookie requests.
- Robinhood-chain data depends on `apps/indexer-robinhood` being synced — currently paused pending an RPC provider decision, so Robinhood wallets will show incomplete data until that resumes.