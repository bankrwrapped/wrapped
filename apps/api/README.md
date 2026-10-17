# apps/api

The Bankr Wrapped backend: raw `Bun.serve` with hand-rolled routing, Postgres through Bun's built-in SQL client, and no framework.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/wrapped/:handle` | Assembled Wrapped payload for an X/Bankr handle (rate-limited 20/min per IP) |
| `GET /api/leaderboard` | Top 20, ranked by ETH earned |
| `GET /api/search?query=` | Handle typeahead (60/min per IP) |
| `GET /api/auth/me` | Current session (30/min per IP) |
| `GET /auth/x/login`, `GET /auth/x/callback` | X OAuth 2.0 (PKCE). The frontend proxies these on bankrwrapped.com |
| `GET /api/image-proxy?url=` | CORS-safe avatar proxy for share-card capture (allowlisted hosts, 5 MB cap) |
| `GET /health` | Liveness |

## How the numbers are computed

- **Earnings (Bankr API):** creator-fees and beneficiary-fees, summed in ETH. This is what the site displays today.
- **Earnings (on-chain, `earningsFromIndexer`):** comes from the indexers' fee events (Doppler `Release`, and Clanker `StoreTokens` attributed to their launch).
  - Both fee sides are priced into ETH.
  - It's scoped to the wallet's Bankr launches as listed by Bankr's API.
  - If Bankr is unreachable, it's reported `unavailable` rather than unscoped.
- **Trading volume:** lifetime volume per token, in this order:
  1. the indexer, which is authoritative once backfilled
  2. GeckoTerminal
  3. DexPaprika

  Tokens no source has are excluded, not zeroed. Unpriced swaps are retried (up to 5 runs) before being accepted as a recorded gap (`unpriced_swap_count`).
- **Background work:**
  - backfill and refresh sweeps run every 5 minutes
  - work is claimed atomically in Postgres
  - the "ready" webhook fires at most once per wallet

See [`../../KNOWN_ISSUES.md`](../../KNOWN_ISSUES.md) for known limitations.

## Environment

Required (the app fails fast on boot without them):

```
DATABASE_URL
GOLDRUSH_API_KEY
BASE_RPC_URL
ENVIO_GRAPHQL_URL_BASE
ENVIO_GRAPHQL_URL_ROBINHOOD
X_CLIENT_ID
X_CLIENT_SECRET
X_REDIRECT_URI            # https://bankrwrapped.com/auth/x/callback in production
SESSION_ENC_KEY           # openssl rand -hex 32
```

Optional:

```
ROBINHOOD_RPC_URL         # defaults to the public endpoint
WRAPPED_WEBHOOK_SECRET    # needed for "Wrapped ready" notifications; skipped (logged) while unset
PORT                      # default 4000
```

## Development

```bash
bun install
psql "$DATABASE_URL" -f db/schema.sql   # idempotent; also upgrades older databases
bun run dev
```

| Command | What it does |
| --- | --- |
| `bun run typecheck` | `tsc --noEmit` over `src` and `scripts` |
| `bun run test` | Every `*.test.ts` in its own process, with `.env` loading disabled |
| `TEST_DATABASE_URL=... bun run test` | Also runs the real-Postgres repository tests (throwaway server only) |
| `bun run build` | Bundles to `dist/` (the Railway start target) |

## Layout

```
src/
  index.ts            routing, CORS, rate limits
  controllers/        HTTP handlers (wrapped, auth)
  services/           wrapped assembly, pricing, on-chain earnings,
                      tradingVolumeEngine/ (provider waterfall),
                      indexerSync/ (Envio client, backfill/refresh jobs, notify)
  repositories/       SQL, one file per table
  middleware/, utils/
  test/setupEnv.ts    fixed env for tests (overrides any real values)
db/schema.sql         schema + idempotent catch-up migrations
scripts/
  run-tests.ts        per-file test runner
  diagnostics/        manual tools against real services (volume, pricing, fees)
  maintenance/        one-off DB maintenance
```

Diagnostics hit real services and need a real `.env`. Run them by hand, for example `bun run scripts/diagnostics/builder-volume.ts <wallet>`.
