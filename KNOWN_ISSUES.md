# Known issues — architecture review (2026-10-17)

Status key: **[fixed, uncommitted]** = changed in the working tree, not yet
committed or deployed. **[open]** = not started. **[unverified]** = inferred
from the code, not confirmed against live data.

## Goal

The indexer is meant to produce the most accurate earnings number for users.
Today it doesn't reach them: `earnings.totalEth`, the leaderboard and the
website all come from Bankr's creator-fees / beneficiary-fees API.
`earningsFromIndexer` is computed and stored, but nothing reads it.

Plan:
1. Re-index, then log/store both numbers per wallet and compare on known
   wallets. Expect indexer >= Bankr, since Bankr's endpoint is `?days=90`.
2. Once they agree, display the indexer number (`earnings.totalEth`,
   leaderboard, website) when its status is `ok`, falling back to Bankr. Rank
   by ETH, not by USD.
3. Keep Bankr's figure as a cross-check and flag large disagreements.

Bankr's API stays as the source of *which tokens are Bankr launches*.
Nothing on-chain marks a launch as Bankr's.

## Roadmap — experience improvements (after the bug fixes)

Enabler: **precompute instead of compute-on-request.** A background
pipeline keeps every known Bankr wallet's Wrapped current as new events are
indexed; the site just reads a finished row. This gives instant loads, no
"pending" volume, and a leaderboard/percentile across all Bankr launchers. It
needs a real job system (queue + DB-backed claims). Open question: where the
full Bankr wallet list comes from (bulk export from Bankr, or seeding from
the indexer).

Options, roughly by impact:
1. **Unclaimed fees prompt + claim:** "you have X ETH waiting", with a claim
   link. Real money, and a reason to come back.
2. **Explainable numbers:** a per-token breakdown, Basescan links per fee
   event (the indexer has tx hashes), and "data as of block N".
3. **Shareable pages + share cards:** `bankrwrapped.com/<handle>` with a
   server-generated preview image for X; opt-in by the owner (also settles
   "only your own Wrapped" and fixes the tweet link).
4. **Richer story from indexer timestamps:** first launch, a monthly
   timeline, best/biggest tokens, busiest hour, a true full-year view.
5. **Progressive loading** for cold starts: show what's ready, stream the
   rest.
6. **Ongoing digest:** a weekly/monthly "your Bankr week" via the Bankr bot
   (reuses the pipeline and the webhook).
7. **Privacy controls:** hide from the leaderboard; public/private page.

Order: accurate numbers (re-index, switch display to the indexer) →
precompute → 1–3 → 4, 6.

## Earnings correctness (indexer path)

- **[fixed, uncommitted]** Doppler `Release` counted only the launched-token
  side of the fees and dropped the ETH/WETH side. Both sides are now priced,
  with native ETH (`address(0)`) handled too. `module8FeesBreakdown.ts`
- **[fixed, uncommitted]** Clanker WETH fees were dropped: `KnownToken` was
  filtered on the *fee* token. Clanker fees are now counted at accrual
  (`StoreTokens`). Each deposit is attributed to its launch via the LP
  locker's `ClaimedRewards(token)`, which closes the same `_collectRewards`
  call (verified in clanker-devco/v4-contracts). Claims are no longer counted:
  they can't be tied to a launch, and counting them would double-count.
- **[fixed, uncommitted]** The indexer tracks every Doppler/Clanker launch on
  the chain, not just Bankr's. Fee events now count only when their launched
  token is in the wallet's Bankr token list. If Bankr is down, the indexer
  number is reported `unavailable` rather than unscoped.
- **[fixed, uncommitted]** `Release.beneficiary` was stored without
  lowercasing. The indexer now lowercases it, and the API matches both forms.
- **[fixed, uncommitted]** Paging on `blockNumber > lastBlock` skipped the rest
  of a block when a page ended mid-block (fee events, swap backfill, swap
  refresh). Paging now uses a `(blockNumber, logIndex)` cursor. `envioClient.ts`
- **Required:** a full re-index of the Base indexer (~2h); Robinhood too when
  it resumes. Afterwards, check that no `StoreTokens` rows have a null
  `launchedToken`; the API reports any as `launch-unattributed`.
  **[unverified]** The attribution reads, in the same tx, what an earlier
  event wrote. This repo was bitten by Envio preload ordering before.
- **[unverified]** Bankr's token list comes from `?days=90`. If that also
  limits *which tokens* are returned, older Bankr launches drop out of scope.
- **[open]** Only Clanker v4 is indexed; v3-era Bankr Clanker launches are
  missing.
- **[fixed, uncommitted]** The Robinhood Envio endpoint (paused) is queried on every
  request. If it errors, the whole indexer number becomes `unavailable` for
  every user, including Base-only wallets. Chains should fail independently.
  → Fix: a chain error is ignored when the wallet has no Bankr launches on that chain; otherwise the number is still `unavailable`, so the cache keeps the last good value.

## Trading volume

- **[open]** It sums numbers that mean different things: indexer =
  lifetime; GeckoTerminal = lifetime of the single top pool; DexScreener =
  last 24h. The first ask always misses the indexer (not backfilled yet), and
  the external result is then cached for 6h.
- **[open]** Temporary pricing failures become permanent: unpriced swaps are
  excluded, the token is still marked `complete`, and refresh advances the
  checkpoint past them. Nothing records which swaps were skipped.
- **[partly fixed, uncommitted]** `isComplete` only counts tokens that went through the indexer's
  cold-start path. Cached, external-provider and Robinhood tokens are never
  tracked. A second wallet holding an already-registered token gets no
  tracking row, so it is reported complete while that token is excluded.
  → Partly fixed: every wallet now gets a tracking row when the indexer path runs for it. Cached, external-provider and Robinhood tokens are still untracked (redesign).
- **[fixed, uncommitted]** A token source of `"unknown"` violates the `indexed_tokens`
  CHECK constraint, so its backfill never starts and the wallet never reaches
  complete.
  → `schema.sql` now allows `'unknown'` (constraint drop/re-add). **Run schema.sql against prod.**
- **[fixed, uncommitted]** Pricing is by day while swaps are grouped by hour, with up to
  ~400 concurrent lookups per page. That floods GoldRush, the failure cache
  marks the day as failed, and swaps are dropped.
  → Now grouped by day with 8 concurrent lookups; refresh reuses the same path.
- **[fixed, uncommitted]** An incomplete volume is recomputed on every request (the 15-min
  gate was removed).
  → The 15-min gate is restored; backfill completion now triggers the recompute instead.

## Background jobs / process model

- **[open]** All job state is in process memory or on in-process timers:
  in-flight maps, the volume-running set, rate-limit buckets, the pricing
  failure cache, the refresh `running` flag, both 5-min sweeps.
  - **Refresh double-counts:** **[fixed, uncommitted]** volume and
    checkpoint now commit in one transaction, and only if the checkpoint
    hasn't moved since the run started.
  - **Volume jobs vanish:** an in-flight volume job is lost on restart.
  - **Rate limits multiply:** each replica gets its own buckets.
- **[fixed, uncommitted]** All rate limiters shared one bucket map keyed by IP, so typeahead
  search used up the wrapped-route budget. Each limiter now has its own map.
- **[fixed, uncommitted]** Lost update: `upsert` writes the merged payload carrying the
  `tradingVolume` read at cache-check time. A background
  `updateTradingVolume` that lands in between is overwritten.
  → On conflict, upsert keeps the row's current `tradingVolume`; only the background job writes it.
- **[open]** The request path does too much: a Bankr search on *every*
  request (handle→wallet isn't cached, so cache hits still use up Bankr's rate
  limit), and fee-event paging plus pricing inside the HTTP request. Timeouts
  are nested (25s inside 45s), and when the race times out, the work keeps
  running.

## Notifications

- **[fixed, uncommitted]** The "Wrapped ready" notify checks the *cached*
  `isComplete`, which is stale at the moment the last token finishes, so it
  usually never fires. When it does, there's no "notified" flag, so it can
  repeat; each notification is a public tweet.
  → Completion is recomputed from the DB on backfill completion; the fresh volume is stored; at-most-once via `wrapped_profiles.ready_notified_at`, released on failure. Gap: if a volume compute for that wallet is already in flight at that moment, the notify is skipped until its next token completes.
- **[fixed, uncommitted]** The tweet links `bankrwrapped.com/<handle>`, which no route
  handles.
  → It now points at the site root; switch back when share pages ship.
- **[fixed, uncommitted]** `WRAPPED_WEBHOOK_SECRET` defaults to `""` on the sender, and it
  isn't in `env.ts`'s required list. A missing secret fails silently.
  → An unset secret now logs an error and skips (without claiming the wallet).

## Auth / security / privacy

- **[fixed, uncommitted]** Sign-in can't work in prod: the `SameSite=Lax` cookie on
  `*.up.railway.app` is never sent from `bankrwrapped.com`. Use
  `SameSite=None; Secure`, or serve the API from a subdomain of
  bankrwrapped.com.
  → Fixed for all browsers: the frontend worker (`apps/web/src/server.ts`) proxies
  `/api/*` and `/auth/*` on bankrwrapped.com to Railway, so the session cookie is
  first-party (`SameSite=Lax`) — Safari/iOS included. Secure detection honors
  `X-Forwarded-Proto`. Malformed cookies no longer 500 the callback.
  **Deploy steps:** set `X_REDIRECT_URI=https://bankrwrapped.com/auth/x/callback`
  on Railway, and register that callback URL in the X Developer Console.
  Verify that Railway preserves the worker's `X-Forwarded-For` (otherwise all
  visitors share one rate-limit bucket).
- **[fixed, uncommitted]** The header's sign-in fallback pointed at
  `/api/auth/x/start`, which never existed; it now uses `/auth/x/login`.
- **[by design]** The landing "Connect X" button goes to `/soon` — an intentional pre-launch gate (confirmed by the owner). Point it at `X_LOGIN_URL` (`lib/wrapped-data.ts`) at launch. The signed-in view is still a placeholder.
- **[open]** "Only your own Wrapped" is enforced only by the skill prompt.
  `/api/wrapped/:handle` is public and never checks the session.
- **[open]** `offline.access` is requested and refresh tokens are stored
  encrypted, but they are never used: `refreshAccessToken` is never called.
  There's also no logout route (`revoke` is unused). Either use the token or
  stop requesting and storing it.
- **[unverified]** `envioQuery` sends no auth header, so the Envio/Hasura
  GraphQL endpoints are presumably reachable without credentials. Check that
  they are private, or at least read-only with no admin access.
- **[fixed, uncommitted]** `getMe` re-runs the Bankr lookup on every call for users with
  no wallet, and `/api/auth/me` has no rate limit.
  → `/api/auth/me` is limited to 30/min per IP; the Bankr re-resolve runs at most once per 5 min per session.
- **[fixed, uncommitted]** `/api/image-proxy` buffers the whole upstream body with no
  size cap.
  → 5MB cap, and redirects are no longer followed.

## Ranking / product numbers

- **[fixed, uncommitted]** Rank is by USD computed with each user's ETH price at their
  last fetch: inconsistent across users. Rank by ETH instead.
  → Ranking and leaderboard are ordered by `total_earnings_eth` (new index in schema.sql).
- **[fixed, uncommitted]** The rank tie-break uses `updated_at`, which changes on every
  refresh.
  → Now `first_indexed_at`, then `wallet_address`.
- **[open]** "Top X%" is out of people who looked themselves up, not out of
  all Bankr users.
- **[open]** It's a "year" recap, but Bankr data is `?days=90`: best day,
  streak and daily earnings cover 90 days. The degraded fallback even says
  `days: 30`.

## Engineering hygiene

- **[fixed, uncommitted]** `schema.sql` can't rebuild the DB: it's missing
  `indexed_tokens.backfill_started_at` and `token_volume_cache`, and
  `create table if not exists` never adds new columns. There is no
  migration tool.
  → Adds `token_volume_cache`, `backfill_started_at`, and `alter ... add column if not exists` catch-ups. Still no real migration tool.
- **[open]** No type check in any build (`bun build` doesn't type-check), no
  tests (only ad-hoc scripts), no CI.
- **[open]** The web app hand-copies the payload type instead of importing
  `@bankr-wrapped/shared`, and it's already behind.
- **[fixed, uncommitted]** Mismatched API defaults: `use-auth.ts` uses
  `localhost:4000`, `wrapped-data.ts` uses the Railway prod URL.
- **[open]** Debug logging in the hot path (`[TV DEBUG]`, `[DEBUG-timing]`),
  and console-only observability: no metrics or alerts, and "unavailable"
  degradations are invisible.
- **[open]** README drift (`indexer-base/`, `ENVIO_GRAPHQL_URL`). Both READMEs are
  root-owned, so they couldn't be edited here.
- **[fixed, uncommitted]** `ProviderStopResult` was declared twice.
- **[open]** Stray `module8FeesBreakdown.ts.bak2/.bak3` files in `apps/api/src/services/`.
- **[open]** The working tree deletes a large number of tracked
  `.turbo/cache` files; `.turbo/` should be gitignored.
