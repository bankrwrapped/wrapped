# Known issues & roadmap

Last reviewed: 2026-10-17. Fixes listed here are on branch `dabushkabash`, covered by tests, and **not yet deployed**. **Unverified** means inferred from the code, not yet confirmed against live data.

## Before the next deploy

1. Run `apps/api/db/schema.sql` against production. It's idempotent. It adds the new columns, tables and indexes, and repairs `tradingVolume` values that were stored as strings (see *Fixed* below).
2. Set `X_REDIRECT_URI=https://bankrwrapped.com/auth/x/callback` on Railway and register that callback URL in the X Developer Console.
3. Set `WRAPPED_WEBHOOK_SECRET` on the API. "Wrapped ready" notifications are skipped while it's unset.
4. Re-index the Base indexer (about 2 hours). This is required for the earnings fixes and the Clanker attribution.
5. After deploying:
   - test sign-in on an iPhone (Safari)
   - check that client IPs vary in the API logs. If they don't, Railway is overwriting the worker's `X-Forwarded-For`, and every visitor shares one rate-limit bucket.

## Next up

- **Re-backfill every token under the new volume logic (decided).** The unpriced-swap retry only affects new runs. Tokens already marked `complete` keep swaps that were dropped in the past.
  - **Plan:** a one-off script that resets every `complete` token to `pending` with `pricing_attempts = 0`, so the sweep re-processes it. Most prices come from `price_cache`, so it's cheap.
  - **Order:** run it after `schema.sql` has been applied.
- **After the re-index, check for `StoreTokens` rows with a null `launchedToken`.** The API reports these as `launch-unattributed`. *Unverified:* the attribution reads, within the same transaction, what an earlier event wrote, and Envio's preload ordering has caused problems in this repo before.
- **CI:** GitHub Actions running `bun run typecheck` and `bun run test` with a Postgres service for the DB tests.

## Goal: the indexer as the source of truth

The indexers exist to give users the most accurate earnings number, but that number doesn't reach users yet. `earnings.totalEth`, the leaderboard and the site all come from Bankr's creator-fees / beneficiary-fees API. `earningsFromIndexer` is computed and stored, but nothing displays it.

1. After the re-index, store or log both numbers per wallet and compare them on known wallets. Expect the indexer's figure to be at or above Bankr's, since Bankr's endpoint uses `?days=90`.
2. Once they agree, display the indexer number when its status is `ok`, falling back to Bankr. Ranking is already by ETH.
3. Keep Bankr's figure as a cross-check and flag large disagreements.

Bankr's API stays the source of *which tokens are Bankr launches*. Nothing on-chain marks a launch as Bankr's.

## Open issues

### Needs a decision
- **"Only your own Wrapped" is enforced only by the skill prompt.** `/api/wrapped/:handle` is public and never checks the session. Enforcing it means requiring sign-in, plus a separate authenticated path for the Bankr bot.
- **Unused X refresh tokens.** `offline.access` is requested and refresh tokens are stored encrypted, but `refreshAccessToken` is never called, and there's no logout route (`revoke` is unused). Either use them or stop requesting and storing them.
- **A "year" recap built on 90 days of data.** Bankr data is fetched with `?days=90`, so best day, streak and daily earnings cover 90 days. It's worth checking whether Bankr accepts a longer window.
- **Percentile pool.** "Top X%" is out of the people who looked themselves up, not all Bankr launchers. Precomputing would fix this (see the roadmap).

### Architecture (redesign)
- **All job state lives in one process:** in-flight maps, the volume-running set, rate-limit buckets, the pricing failure cache, and both 5-minute sweeps. On restart, an in-flight volume job is lost. With several replicas, rate limits multiply. Backfill and refresh claims are already database-backed.
- **The request path still pages and prices fee events inside the HTTP request.** Timeouts are nested (a 25s race inside a 45s server timeout), and a timed-out breakdown keeps running in the background.
- **`isComplete` doesn't track every token.** Every wallet that reaches the indexer path is tracked now, but tokens served from the volume cache, from external providers, or on Robinhood are still invisible to the completion check.
- **Notification gap:** if a volume computation for a wallet is already running at the moment its last token completes, the notification waits for that wallet's next token completion.

### Coverage and data
- **Old Clanker launches:** only Clanker v4 is indexed, so v3-era Bankr Clanker launches are missing.
- **Bankr's token list:** *unverified* whether `?days=90` also limits *which tokens* Bankr returns. If it does, older Bankr launches drop out of the on-chain scope.
- **Robinhood indexer** is paused pending a paid RPC tier (see `apps/indexer-robinhood`).
- **Refresh retry window:** a refresh retries unpriced swaps every 5 minutes, so its 5 attempts span about 25 minutes, versus about 75 for backfill.

### Security and operations
- **Hasura exposure** (*unverified*): `envioQuery` sends no auth header, so the Envio/Hasura GraphQL endpoints are presumably public. Confirm they're private, or at least read-only with no admin access.
- **Safari and the subdomain option:** sign-in works in every browser through the frontend proxy. Serving the API from an `api.bankrwrapped.com` subdomain would be an alternative that doesn't depend on the proxy.
- **Observability:** logs are console-only, with no metrics or alerts. "Unavailable" degradations are invisible.
- **Migrations:** `schema.sql` is idempotent and catches older databases up, but there's no real migration tool.

## Fixed (on this branch, not yet deployed)

**On-chain earnings**
- **Both fee sides:** Doppler `Release` now prices both sides, including native ETH (`address(0)`). Previously the ETH/WETH side was dropped.
- **Clanker attribution:** Clanker fees are counted at accrual (`StoreTokens`), attributed to their launch via the LP locker's `ClaimedRewards(token)` (verified in clanker-devco/v4-contracts). WETH deposits are no longer dropped, and claims aren't counted, since they can't be tied to a launch.
- **Bankr-only scope:** only fees on the wallet's Bankr launches count. If Bankr is down, the number is reported `unavailable`, never unscoped.
- **Address case:** `Release.beneficiary` is lowercased, and the API matches both cases.
- **No skipped events:** keyset `(blockNumber, logIndex)` paging for fee events and swaps. Paging by block alone skipped the rest of a block whenever a page ended inside it.
- **Independent chains:** a failing chain only fails the number if the wallet has launches on it.

**Trading volume**
- **Lifetime only:** DexScreener (24-hour volume) is gone from the waterfall and ignored in the cache. Stored results carry `methodVersion`, and older ones are recomputed once.
- **Retried pricing:** unpriced swaps are retried, with up to 5 runs before the gap is accepted and recorded in `unpriced_swap_count`, instead of being dropped for good.
- **Day-level pricing:** prices are grouped by day with a cap of 8 concurrent lookups. Hourly grouping used to flood GoldRush.
- **Atomic refresh:** the refresh commits volume and checkpoint in one transaction, and only if the checkpoint hasn't moved.
- **Every wallet tracked:** each wallet gets a backfill-tracking row, and tokens with an `'unknown'` source can backfill.
- **Recheck gate:** the 15-minute recheck for incomplete volume is restored.
- **Volume stored as text (found by the real-Postgres tests):** `updateTradingVolume` stored `tradingVolume` as a JSON *string*. Volume therefore never read as complete, was recomputed on every request, the ready notification couldn't fire, and clients got a string. Fixed at the write, normalized on read, and repaired in place by `schema.sql`.
- **Lost updates:** the upsert no longer overwrites the background job's `tradingVolume`.

**Notifications**
- **Fresh completion:** the "Wrapped ready" notify recomputes completion and volume when a backfill finishes.
- **At most once:** it fires at most once per wallet (`ready_notified_at`), and the claim is released if the send fails.
- **Missing secret:** it fails loudly when the secret is unset.
- **Working link:** the tweet links the site root; no `/<handle>` route exists yet.

**Auth and security**
- **Sign-in in every browser:** the frontend worker proxies `/api/*` and `/auth/*`, so the session cookie is first-party (`SameSite=Lax`). `Secure` honors `X-Forwarded-Proto`, and malformed cookies no longer 500 the callback.
- **Login link:** the header's sign-in fallback used a route that never existed (`/api/auth/x/start`).
- **Rate limits:** `/api/auth/me` is rate-limited, the wallet re-resolve is throttled per session, and each limiter has its own buckets. Previously one shared per-IP bucket meant search typing used up the Wrapped budget.
- **Image proxy:** a 5 MB cap, and redirects are no longer followed.
- **Wallet-lookup cache:** handle → wallet is cached for 10 minutes (2 for not-found), so cache hits no longer call Bankr.

**Ranking**
- **By ETH:** ranking is by the displayed ETH figure, not by USD computed at each user's own ETH price.
- **Stable ties:** tie-breaks no longer change on every refresh.

**Engineering**
- **Type checks and tests:**
  - `bun run typecheck` gates `build`, so deploys fail on type errors.
  - `bun run test` runs 75 tests across the API, web, both indexers and the webhook.
  - API test files each run in their own process with `.env` loading disabled.
  - DB tests run against a throwaway Postgres via `TEST_DATABASE_URL`.
  - Each fix was verified by reverting it and confirming its test fails.
- **Schema:** `schema.sql` rebuilds a fresh database and catches older ones up, covering `token_volume_cache`, `backfill_started_at`, `decimals`, `pricing_attempts`, `unpriced_swap_count` and `ready_notified_at`.
- **Shared types:** the frontend imports its payload types from `@bankr-wrapped/shared`, and auth and data share one API URL.
- **Repo cleanup:**
  - READMEs rewritten to match the code
  - `.turbo/` cache untracked
  - one-off debug scripts and output removed
  - manual diagnostics moved to `apps/api/scripts/` and type-checked
  - debug logging removed from the request path

**By design:** the landing page's "Connect X" goes to `/soon` until launch. Point it at `X_LOGIN_URL` (`apps/web/src/lib/wrapped-data.ts`) then. The signed-in view is still a placeholder until the reveal ships.

## Roadmap: experience

The enabler is to **precompute instead of computing on request**: a background pipeline keeps every known Bankr wallet's Wrapped current as new events are indexed, and the site just reads a finished row. That gives instant loads, no "pending" volume, and a percentile across all Bankr launchers. It needs a real job system (a queue plus database-backed claims). Open question: where the full Bankr wallet list comes from (a bulk export from Bankr, or seeding from the indexer).

By impact:
1. **Unclaimed fees, with a claim link.** "You have X ETH waiting" is real money and a reason to come back.
2. **Explainable numbers:** a per-token breakdown, Basescan links per fee event, and "data as of block N".
3. **Shareable pages and share cards:** `bankrwrapped.com/<handle>` with a server-generated preview image, opt-in by the owner. This also settles "only your own Wrapped" and restores the per-handle tweet link.
4. **A richer story from indexer timestamps:** first launch, a monthly timeline, best and biggest tokens, busiest hour, a true full-year view.
5. **Progressive loading** for cold starts.
6. **An ongoing digest:** a weekly or monthly "your Bankr week" via the Bankr bot.
7. **Privacy controls:** hide from the leaderboard; public or private page.

Order: accurate numbers (re-index, switch the display to the indexer) → precompute → 1–3 → 4 and 6.
