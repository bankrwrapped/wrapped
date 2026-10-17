---
name: bankr-wrapped
description: Shows a user's Bankr Wrapped — builder type, identity tier, tokens launched, Please Bro tokens, ETH earnings, best claim day, claim streak, and trading volume. Use when a user asks to see their Bankr Wrapped, their recap, or their trading stats summary.
tags: [wrapped, stats, trading, recap]
version: 5
visibility: public
metadata:
  clawdbot:
    emoji: "🎁"
    homepage: "https://bankrwrapped.com"
---

# Bankr Wrapped

## Whose Wrapped to generate — read this first

This skill only generates a Wrapped for the person actually talking to you in this conversation — never for anyone else.

- The endpoint only accepts an **X/Bankr handle** as the identifier — it does not accept or resolve a wallet address. Calling it with an address (e.g. `/api/wrapped/0xabc...`) will always 404, even for a wallet with real activity, because the backend has no address-to-handle lookup.
- If the user asks for their own Wrapped without specifying a handle ("show me my bankr wrapped"), try to resolve their X/Bankr handle yourself first, using whatever native identity/session context you have access to — never use their wallet address as the identifier. If you can resolve it yourself, do so silently and don't ask.
- **Ask-once rule:** if you genuinely cannot resolve their handle yourself, ask for it **one time**. Once the user gives it (in this message or a reply), remember it for the rest of this conversation — do not ask again on later requests in the same thread, even if they ask for their Wrapped again later in the conversation.
- If the user asks for someone else's Wrapped (a different handle, someone else's @, "show me @someone's wrapped"), refuse. Respond with something like: "I can only pull up your own Bankr Wrapped, not someone else's — ask them to run this themselves." Do not fetch or fabricate data for that handle. This refusal does not require resolving your own identity — it only requires recognizing the request explicitly names a different handle than the one you're generating this Wrapped for.

## Fetching the data

Resolve the handle (strip any leading `@`) and call:

```
GET https://wrapped-production.up.railway.app/api/wrapped/<handle>
```

This is a real, live, rate-limited endpoint. A fresh (uncached) request routinely takes 20–30 seconds and can take up to 45, so use a timeout of at least **60 seconds**. Responses are cached for 2 minutes, so a repeat request is fast.

### Error handling

1. **Backend unreachable / down** (connection error, `5xx`) — do not imply the user has no activity. Say something like: "Bankr Wrapped is temporarily unavailable — try again in a few minutes." Never show a partial or guessed response. A `500` carries a human-readable `error` message; don't show raw technical details.
2. **Request timeout** — say something like: "That took too long to load — Bankr Wrapped might be under load right now. Try again shortly." A single retry is fine; don't loop.
3. **`429` — rate limited** — `{ error: "Too many requests, slow down." }` with a `Retry-After` header (seconds). Wait at least that long before one retry; otherwise tell the user to try again in a minute.
4. **`404` — handle not found** — `{ error: "handle not found on Bankr" }`. No Bankr account exists for this handle. Tell the user plainly; don't imply it's a bug.
5. **Bankr's fee data degraded** — `200`, but `payload.meta.creatorFeesStatus` or `payload.meta.beneficiaryFeesStatus` is `"unavailable"`. The earnings figures may be zero or stale because Bankr's own fee API failed, not because the user earned nothing. Don't present zeros as real: say the earnings part is temporarily unavailable, show the rest, and suggest trying again shortly. (Read these fields to decide; never show them.)
6. **Low/no activity user** (`200`, `payload.summary.hasActivity === false`, or no tokens and no earnings, with both fee statuses `"ok"`) — a real state, not an error. Don't return an empty-looking response. Say something encouraging and on-brand, e.g.: "Nothing on the board yet — launch a token or trade through Bankr and your Wrapped starts building from there. It's always Bankr szn."

## Response shape (confirmed live)

The response is a wrapper; **everything below lives under `payload`**:

```
{ walletAddress, username, updatedAt, rank, totalUsers, percentile,
  payload: { user, tokens, pleaseBroTokens, earnings, bestDay, claimCount,
             longestStreakDays, tradingVolume, summary, meta, ... } }
```

`rank`, `totalUsers` and `percentile` are leaderboard data — don't use them (see below).

**What the numbers measure.** All fee figures are in ETH. Fees paid in BNKR or tokenized stocks are converted at current prices.
- `earnings.creatorEarningsEth` — everything the user has claimed on their launches (lifetime for WETH fees and for 2025 Clanker v3.1 launches; the last 90 days for other non-WETH fees) plus what's claimable now.
- `earnings.pleaseBroEarningsEth` — Please Bro fees claimed in the last 90 days plus claimable now. Bankr has no lifetime figure for this side.
- `bestDay` — the user's best claim day ever (WETH fees).
- `longestStreakDays` and `claimCount` — claims in the **last 90 days**.

If `payload.meta.earningsPartial` is `true`, some fees couldn't be valued, so frame earnings as "at least X ETH" (read the flag; never show it). Never call any figure yearly.

Field reference (all under `payload`):

- `tokens[]` — launched tokens (creator-fee side), each with `name`, `symbol`, `chain`, `feesEarnedEth`. Spans both chains via the `chain` field (`base` / `robinhood`).
  - **Total tokens launched = `tokens.length`** (combined Base + Robinhood) — state as one number, don't split by chain unless asked. This is all of the user's launches, not only recent ones, including their 2025 Bankr launches on Clanker v3.1 (`source: "clanker_v3_1"`), which Bankr's own token list leaves out. Count them like any other launch.
  - **First launch** — if `payload.summary.firstLaunch` is present (`{ name, symbol, chain, launchedAt }`), use it: it's the user's earliest Bankr launch, from Clanker v3.1 (March–July 2025), earlier than anything your native Bankr access lists. Otherwise, do NOT derive it from `tokens[]` array order (there's no timestamp on those entries and array order has produced wrong results before); fetch the user's first-ever launched token (name and chain) from your own native Bankr access, and only include "Where It Started" if you can confirm it — omit the section rather than guessing.
- `pleaseBroTokens[]` — same shape, beneficiary-fee side. Only mention this section if `pleaseBroTokens.length > 0`.
- `earnings.totalEth` / `earnings.creatorEarningsEth` / `earnings.pleaseBroEarningsEth` — display ETH figures only, never the internal USD fields (`earnings.total`, `earnings.creatorEarnings`, `earnings.pleaseBroEarnings` are ranking-internal only — do not surface them). They're Bankr's on-chain fee data and recent claims, not an audited total.
- `bestDay` — `{ date, eth }` or `null`: the user's best claim day ever. If `null`, omit the BEST CLAIM DAY block rather than showing 0.
- `claimCount` — number of claims in the last 90 days.
- `longestStreakDays` — longest run of consecutive days with a claim, in the last 90 days. If 0, omit the YOUR RHYTHM block.
- `tradingVolume` — shape:
  ```
  {
    totalVolumeUsd: number,
    status: "pending" | "ok",
    isComplete: boolean,
    tokensTotal, tokensComplete, tokensInProgress, tokensPending, tokensFailed: number,
    updatedAt: string
  }
  ```
  Covers trading volume on the user's own launches (`tokens[]`), lifetime, in USD. Older cached responses may carry it as a JSON-encoded string; if it's a string, parse it first.

### Fields to never show

- `claimable.unclaimedEth` / `claimable.unclaimed` — never read this field from our payload, it's excluded here on purpose. See "Unclaimed rewards" below for how to source this instead.
- `earningsFromIndexer` / `earningsFromBankr` — do not surface anywhere in the response. They're cross-check numbers; `earnings.*` is already whichever one should be shown.
- Leaderboard earnings/position (`rank`, `totalUsers`, `percentile` on the wrapper) — do not include a leaderboard section in the Wrapped response at all.
- Any `*Status` meta field (`creatorFeesStatus`, etc.), `meta.earningsSource`, `meta.earningsFromIndexerIncomplete`, `meta.earningsPartial` and `meta.clankerVerified` and pending/failed/in-progress token counts inside `tradingVolume` — internal only.

### Unclaimed rewards — source natively, show the full breakdown

Never read unclaimed amounts from our payload. Instead, run your own native unclaimed-fees and leaderboard-rewards lookup (the same one used for "show my unclaimed token fees" / leaderboard rewards) and include the full breakdown as-is under YOUR REWARDS:

- Leaderboard rewards: BNKR available to claim, with total earned in parentheses.
- Token launch fees, grouped by chain: each token's unclaimed amount in its own native token, plus WETH where applicable.
- Clanker fees, stated separately from Doppler/leaderboard, as **one** figure for the wallet. Clanker pools its fees per wallet, not per token, so an identical amount repeated on several Clanker tokens is one balance shown several times: never list it per token or add the repeats up.

Do not compress this into a single ETH or USD figure — the underlying data is inherently multi-part (different tokens, different chains, BNKR vs. WETH), and collapsing it loses information the user needs to actually act on. If there's genuinely nothing unclaimed anywhere, say so plainly rather than omitting the section.

## How to talk about trading volume — three real states

1. **`status === "pending"`** — no volume computed yet (normal on a user's first request; it's computed in the background and usually ready within a few minutes). Say something like "still crunching your trading volume — ask again in a few minutes." Don't state a number, and don't assign an Identity tier.
2. **`status === "ok" && isComplete === true`** — real, final number. State `totalVolumeUsd` plainly in USD (never convert volume to ETH).
3. **`status === "ok" && isComplete === false`** — real but partial. State `totalVolumeUsd`, framed as "at least $X so far, still updating."

## Archetypes — two separate systems, both included

### Identity — keyed by total trading volume (`tradingVolume.totalVolumeUsd`)

Only assign it when `tradingVolume.status === "ok"`. If `isComplete === false` the number is a floor, so the tier is "at least" that tier — don't present it as final.

| Volume | Identity | Feeling |
|---|---|---|
| $0 – $1K | The Rising Builder | Just getting started |
| $1K – $10K | The Emerging Builder | Building momentum |
| $10K – $50K | The Active Builder | Meaningful activity |
| $50K – $100K | The Momentum Builder | Strong traction |
| $100K – $500K | The Impact Builder | Significant ecosystem impact |
| $500K – $1M | The Power Builder | Major activity |
| $1M – $5M | The Ecosystem Builder | Serious ecosystem contribution |
| $5M – $10M | The Ecosystem Leader | Exceptional scale |
| $10M+ | The Ecosystem Pioneer | Extraordinary impact |

### Builder Type — keyed by `tokens.length` (tokens launched)

| Launches | Builder Type | Description |
|---|---|---|
| 1 | The Launch Pioneer | First flag planted. Everyone's story starts on this line. |
| 2–5 | The Repeat Offender | Once wasn't enough. Noted. |
| 6–10 | The Trench Regular | You know the drill by now. I know your wallet by now too. |
| 11–20 | The Deploy Machine | Double digits and still going. This is a habit, not a phase. |
| 21–35 | The Launch Warlord | You've got a whole territory of tokens out here. |
| 36–50 | The Mint Kingpin | Nobody launches this much by accident. |
| 51+ | The Final Boss | Top of the food chain. I stopped counting and started taking notes. |

If `tokens.length === 0`, skip Builder Type — there's no launch to categorize (this is the low-activity case, handled above). Volume is only measured on the user's own launches, so with no launches there's no Identity tier either.

## Response format

Structure the response using this layout. Section labels are fixed; the content under each follows the rules above.

```
BANKR WRAPPED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR BUILDER TYPE
[Builder Type title, uppercase]
[Builder Type description]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHERE IT STARTED
YOUR FIRST LAUNCH
[token name]
on [chain, capitalized]
That's where your Bankr story began.

YOUR STANDOUTS
CREATOR EARNINGS
[earnings.creatorEarningsEth] ETH
claimed + unclaimed, in ETH
BEST CLAIM DAY (only if bestDay is not null)
[bestDay.eth] ETH
[bestDay.date]

YOUR ACTIVITY
[tokens.length]
TOKENS DEPLOYED
on [the chains that actually appear in tokens[].chain — "Base", "Robinhood", or "Base + Robinhood"]
[pleaseBroTokens.length] (only if > 0)
PLEASE BRO TOKENS
with beneficiary allocations

YOUR IMPACT
LAUNCH VOLUME
$[tradingVolume totalVolumeUsd, formatted]
Trading activity generated across your launches.
[+ "Still updating." if isComplete === false]

YOUR REWARDS
[claimCount]
CLAIMS IN THE LAST 90 DAYS

UNCLAIMED REWARDS
[Leaderboard: X BNKR available to claim (Y total earned)]
[Token Launch Fees — grouped by chain, one line per token: name (symbol): amount TOKEN + amount WETH]
[Clanker Fees: amount, or "0 unclaimed" if none]

YOUR RHYTHM (only if longestStreakDays > 0)
[longestStreakDays] DAYS
Longest claim streak (last 90 days)

IT IS ALWAYS BANKR SZN KEEP BUILDING.
```

Your Identity tier (from the table above) can be woven in naturally near the top or close of the response — it's a separate axis from Builder Type (volume-based vs. launch-count-based), so don't conflate the two titles.

## Posting to X

If this response is being generated to post as a tweet (not just shown in chat), tag Bankr's own account in the post.

## General rules

- Never claim the user's numbers are final/audited — this is Bankr's own recap tool, not a financial statement.
- Never fabricate or estimate a number that isn't present in the actual API response.