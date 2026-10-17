# Known issues & roadmap

Last reviewed: 2026-10-17. Fixes listed here are on branch `dabushkabash`, covered by tests, and **not yet deployed**. **Unverified** means inferred from the code, not yet confirmed against live data.

## Before the next deploy

1. ~~Run `apps/api/db/schema.sql` against production.~~ **Done 2026-10-17** (`pricing_attempts` present; 2 stringified `tradingVolume` rows repaired).
2. ~~Set `X_REDIRECT_URI`~~ **Done.** Register `https://bankrwrapped.com/auth/x/callback` in the X Developer Console if not already.
3. ~~`WRAPPED_WEBHOOK_SECRET`~~ **Verified 2026-10-17: it matches on both sides.** A request with an unparseable body, signed with the API's secret, got the webhook's `400 invalid json` (past the signature check, so no prompt and no post); a wrongly signed one got `401 invalid signature`. If it ever needs re-checking, repeat that probe: signed with the real secret, an invalid-JSON body can't produce a tweet.
4. **Re-index the Base indexer: automatic on merge.** Since about 15:55 on 2026-10-17 the indexer has been crash-looping: `storage was initialized by an older envio version`. Envio won't resume that data, so nothing new has been indexed since. The new start wrapper (`apps/indexer/scripts/start.ts`) starts over **once** when Envio reports incompatible storage, and otherwise resumes, so Railway's automatic restarts keep filling the same data instead of wiping it. No manual `envio start -r` and no start-command edits. The re-index takes about 2 hours plus Clanker v3.1 from block 27,733,337. Until it catches up, indexer numbers show as unavailable or partial; displayed earnings (Bankr) are unaffected, and volume backfills don't mark tokens complete before the chain is synced.
5. After deploying:
   - test sign-in on an iPhone (Safari)
   - check that client IPs vary in the API logs. If they don't, Railway is overwriting the worker's `X-Forwarded-For`, and every visitor shares one rate-limit bucket.

## Next up

- **Re-backfill every token under the new volume logic (decided, script ready).** The unpriced-swap retry only affects new runs. Tokens already marked `complete` keep swaps that were dropped in the past.
  - **Script:** `apps/api/scripts/maintenance/rebackfill-complete-tokens.ts` resets `complete` Base tokens to `pending` with `pricing_attempts = 0`. It's a dry run by default; pass `--apply`, and optionally `--limit N` to go in waves. Backfill rescans from block 0 and overwrites the total, so nothing is double-counted, and nobody gets a second "Wrapped ready" notification.
  - **Order:** after `schema.sql` is applied **and** the new API is deployed (the old code would drop the same swaps again). The script refuses to run without the `pricing_attempts` column.
  - **Expect:** the sweep picks up reset tokens after 15 minutes idle. While they're pending, affected wallets show volume as incomplete. The sweep now skips a tick while the previous one is still running, so a large backlog stays at 3 concurrent backfills.
- **After the re-index, check for `StoreTokens` rows with a null `launchedToken`.** The API reports these as `launch-unattributed`. *Unverified:* the attribution reads, within the same transaction, what an earlier event wrote, and Envio's preload ordering has caused problems in this repo before.

## Data accuracy (verified 2026-10-17 against live Bankr API, prod and on-chain)

Checked on the leaderboard's top wallets. Our arithmetic matched Bankr's raw per-token data exactly; the problems were in what that data measures. **Fixed on this branch** unless marked open:

- **BNKR- and stock-quoted fees counted as 0 (fixed).** `wethAmount` only read a "WETH" label, but many Doppler pools quote in BNKR (`0x22af33fe…`) or tokenized stocks. The quote side is now valued whatever it is, at current prices (`bankrFeeValuation.ts`, `currentPrices.ts`). Example: 0xDeployer had about 2.8 ETH of such fees uncounted, against about 4.5 ETH counted. (An earlier estimate of 7.15 ETH was wrong: it counted a launched token that is itself *named* "BNKR". The valuation identifies the quote side by position, so that case is handled and tested.)
- **Phantom Clanker claimable from Bankr (fixed in our numbers; worth reporting to Bankr).** About 0.0677 WETH appears on every Clanker token, across at least 10 unrelated wallets. ClankerFeeLocker `availableFees(wallet, WETH)` returns 0 to 0.0006 for them. Bankr's Clanker claimable is now ignored and the on-chain balance is read once per wallet (`clankerFeeLocker.ts`). The skill's native "unclaimed fees" lookup probably still shows the phantom; the skill now says to state Clanker as one wallet-level figure.
- **90-day figures presented as lifetime (fixed where Bankr allows).** `?days=` is capped at 90. `dailyEarnings` is WETH *claimed* per day. Bankr's `lifetimeEarnedWeth` and `lifetimeBestDay` are lifetime Doppler WETH claims: they match the daily series exactly where they overlap, and exclude Clanker. The creator total and best day now use them, never dropping below the 90-day figures when Bankr's lifetime lags. **Open:** Please Bro, claim count and streak have no lifetime source and stay 90 days, and per-token figures stay 90 days + claimable, so they can sum to less than the creator total.
- **The token list is NOT limited by `?days=90`**: same count at 30, 90 and 365.
- **Stale leaderboard (fixed).** `leaderboardRefresh.ts` re-fetches every 30 minutes the top 50 rows older than an hour, plus the 25 stalest rows overall.
- **One shared rate-limit bucket for the bot (fixed, needs config).** A request with a key from `WRAPPED_TRUSTED_CLIENT_KEYS` in `X-Wrapped-Client-Key` gets a 600/min bucket per key. Key only: an IP allowlist could be spoofed via `X-Forwarded-For`. **Open:** Bankr has to send the header from the bot's runtime.
- **Open: unpriced quote assets.** A quote asset with no known address and no indexer pool record, or no price, counts as 0 and sets `meta.earningsPartial`. That's mostly Robinhood stock tokens on the Please Bro side when the indexer's pool lookup is unavailable.

## Clanker fees

### v4 (Bankr launches from about August 2025 to February 2026): verified against the chain

- **The check (`clankerLedger.ts`).** ClankerFeeLocker keeps one balance per (fee owner, fee token). So for every fee token, the indexer's *credited* (`StoreTokens`) minus *claimed* (`ClaimTokens*`) must equal `availableFees(wallet, token)` on-chain, read at the indexer's last processed block. When every token matches and every Clanker credit was attributed and priced, `meta.clankerVerified` is true. Each Clanker launch then shows its lifetime credits from the indexer, unclaimed included, in WETH and the launched token. Otherwise the wallet falls back to Bankr's recent claims plus the on-chain unclaimed balance, and its indexer number counts as incomplete.
- **Unclaimed, launched-token side included.** The on-chain read now covers the wallet's launched tokens as well as WETH, since Clanker can pay fees in both. Balances in a token with no price count as 0 and set `meta.earningsPartial`.
- **Indexer fix (needs the re-index).** The `ClaimTokens` and `ClaimTokensPermissioned` handlers kept a claim only if its fee token was a `KnownToken`, meaning a launched token. Clanker fees are mostly WETH, so nearly every claim was dropped, and the check could never pass. Claims are now all kept and keyed by the fee owner, the wallet that earned them, including permissioned claims paid to someone else. **Until the re-index, no wallet will verify.**
- **Coverage confirmed.** Every Clanker v4 contract on Base was deployed after the indexer's start block (fee locker at block 31,526,701, start block 28,415,516), so v4 history is complete.
- `compare-earnings.ts` prints "clanker verified" or "clanker NOT verified" per wallet.

### v3.1 (Bankr launches from 2025-03-18 to about July 2025): built, needs the re-index

Verified 2026-10-17 from clanker-devco/v3.1-contracts, the Clanker API and on-chain reads:
- **Bankr launched through Clanker for almost a year.** Bankr's deployer `0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9` launched 140,541 Clanker tokens. They were v3.1 from 2025-03-18 (factory `0x2A787b2362021cC3eEa3C24C4748a6cD5B687382`, deployed at block 27,733,337; `LpLockerv2` `0x33e2Eda238edcF470309b8c6D228986A1204c8f9`), then v4 until 2026-02-10.
- **How v3.1 fees work.** The pools are Uniswap V3 with a 1% fee. Clanker takes 20%, the creator takes `creatorReward`% (40% on every Bankr launch sampled), and the interface (Bankr) the rest. There's no fee locker: fees sit in the LP position until anyone calls `collectRewards`, which pays out directly and emits `ClaimedRewards`.
- **Bankr's API leaves v3.1 out entirely.** For example, Rayblancoeth has 4 v3.1 launches, 0xDeployer 6 and jessepollak 3, and none appear in Bankr's fee API.

What's built (decided: v3.1 launches count toward the launch total and Builder Type):
- **Indexer.** The chain now starts at the v3.1 factory's block, and every existing contract keeps its own `start_block` (28,415,516), so nothing else is replayed.
  - `ClankerV31.TokenCreated` with `msgSender` = Bankr's deployer creates a `ClankerV31Launch`. Other senders aren't Bankr's, even when they name Bankr's interface admin; that was checked on real deploy transactions.
  - `ClankerV31LpLocker.ClaimedRewards` for those positions writes the creator's share of both tokens as one `ClankerV31ClaimedRewards` fee row, using the new `tokenAddress1` column.
- **API (`clankerV31.ts`).** A wallet's v3.1 launches are looked up by creator admin and join `tokens[]` with `source: "clanker_v3_1"`.
  - Their fees are the collects paid to the wallet, valued at the time, plus the creator's share of what's still uncollected. The uncollected part is read on-chain by simulating `collect` as the locker, and only counts when the creator payout goes to this wallet.
  - These fees go into creator earnings, unclaimed, and the indexer number.
  - `summary.firstLaunch` is the earliest v3.1 launch.
  - Volume skips the indexer, which only sees V4 swaps, and comes from GeckoTerminal or DexPaprika.
  - The v3.1 queries are separate from the main fee query, so until the re-index the API simply has no v3.1 data and nothing else is affected. It logs "indexer has no v3.1 data yet".
- **Checked on the real chain:** REMITTIX's position gives 0.000019 ETH uncollected for its creator and 0 for any other wallet, matching an independent viem read.

Still open:
- **Older launches.** DRB (2025-03-07) was Clanker v3.0 (`LPLockerv2` `0x5eC4f99F342038c67a312a166Ff56e6D70383D86`) from a different sender. Whether Bankr launched other tokens before v3.1 isn't confirmed.
- **Fee recipient changes.** A v3.1 creator admin can change the fee recipient. Collects follow the recipient at collect time; uncollected fees count only when the current recipient is the wallet.

## Goal: the indexer as the source of truth

**Unclaimed fees (fixed on this branch):** the indexer counts Doppler `Release`, which fires only when fees are *paid out*, so on its own it missed every unclaimed fee. jessepollak showed 0.00 ETH against 2.07 on Bankr, all of it unclaimed. The indexer number now adds each Doppler pool's claimable fees, both sides like `Release`, from Bankr's per-pool amounts at current prices. Clanker needs nothing extra, because `StoreTokens` accrual already includes unclaimed fees. Anything unpriced marks it incomplete, so the switch falls back to Bankr. Still compare before switching: the claimable part comes from Bankr's data, so the two numbers aren't fully independent.


The indexers exist to give users the most accurate earnings number, but that number doesn't reach users yet. `earnings.totalEth`, the leaderboard and the site all come from Bankr's creator-fees / beneficiary-fees API. `earningsFromIndexer` is computed and stored, but nothing displays it.

Built and waiting on the re-index; the switch is **off**.

1. **Compare (ready):** after the re-index, run `apps/api/scripts/diagnostics/compare-earnings.ts --top 25` (or with known handles; add `--tokens` for per-token detail). Expect the indexer's figure to be at or above Bankr's. Both now include claimable fees, but the indexer also counts the launched-token side of Doppler fees, which Bankr's figure leaves out. Wallets well below Bankr, or marked incomplete, are the ones to look at.
2. **Switch (built, off):** set `EARNINGS_SOURCE=indexer` on the API. The per-token, creator, Please Bro and total figures then all come from the indexer, but only when its number is `ok` **and** complete. Otherwise the wallet falls back to Bankr. A wallet that was already showing the indexer number keeps its last indexer result rather than flipping back. The leaderboard follows, since it ranks by `earnings.totalEth`. Claimable, daily earnings, best day, streak and claim count stay Bankr's, because the indexer doesn't know what's unclaimed.
3. **Cross-check (built):** every payload stores `earningsFromBankr` next to `earningsFromIndexer`, plus `meta.earningsSource`. The API logs `earnings disagreement` when they differ by 20% and at least 0.01 ETH.

Caveats once it's on: cached profiles only switch when they're next fetched, so for a while the leaderboard ranks a mix of sources. Rolling back means unsetting the variable; profiles then return to Bankr on their next fetch.

Bankr's API stays the source of *which tokens are Bankr launches*. Nothing on-chain marks a launch as Bankr's.

## Open issues

### Needs a decision
- **"Only your own Wrapped" is enforced only by the skill prompt.** `/api/wrapped/:handle` is public and never checks the session. Enforcing it means requiring sign-in, plus a separate authenticated path for the Bankr bot.
- **Unused X refresh tokens.** `offline.access` is requested and refresh tokens are stored encrypted, but `refreshAccessToken` is never called, and there's no logout route (`revoke` is unused). Either use them or stop requesting and storing them.
- **A "year" recap built on 90 days of data.** Bankr caps `?days=` at 90 (verified), so best day, streak and claims cover 90 days. The skill now says so. Fixing it properly means Bankr's lifetime fields, or our own indexer history.
- **Percentile pool.** "Top X%" is out of the people who looked themselves up, not all Bankr launchers. Precomputing would fix this (see the roadmap).

### Architecture (redesign)
- **All job state lives in one process:** in-flight maps, the volume-running set, rate-limit buckets, the pricing failure cache, and both 5-minute sweeps. On restart, an in-flight volume job is lost. With several replicas, rate limits multiply. Backfill and refresh claims are already database-backed.
- **The request path still pages and prices fee events inside the HTTP request.** Timeouts are nested (a 25s race inside a 45s server timeout), and a timed-out breakdown keeps running in the background.
- **`isComplete` doesn't track every token.** Every wallet that reaches the indexer path is tracked now, but tokens served from the volume cache, from external providers, or on Robinhood are still invisible to the completion check.
- **Notification gap:** if a volume computation for a wallet is already running at the moment its last token completes, the notification waits for that wallet's next token completion.

### Coverage and data
- **Old Clanker launches:** only Clanker v4 is indexed, so v3-era Bankr Clanker launches are missing.
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
