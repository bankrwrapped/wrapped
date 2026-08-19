---
name: bankr-wrapped
description: Shows a user's Bankr Wrapped — tokens launched, Please Bro tokens, ETH earnings, unclaimed rewards, best day, longest streak, and trading volume. Use when a user asks to see their Bankr Wrapped, their yearly recap, or their trading stats summary.
tags: [wrapped, stats, trading, recap]
version: 1
visibility: public
metadata:
  clawdbot:
    emoji: "🎁"
    homepage: "https://bankrwrapped.com"
---

# Bankr Wrapped

When a user asks for their Bankr Wrapped, resolve their handle (strip any leading `@`) and call:

```
GET https://wrapped-production.up.railway.app/api/wrapped/<handle>
```

This is a real, live, rate-limited endpoint — do not retry aggressively on 429; if rate-limited, tell the user to try again shortly rather than hammering the request.

## Response shape (confirmed live from `WrappedPayload`)

- `404` → `{ error: "handle not found on Bankr" }` — tell the user this handle has no Bankr activity, don't imply it's a bug.
- `200` → the wrapped payload, including:
  - `tokens[]` — launched tokens (creator-fee side), each with `name`, `symbol`, `chain`, `feesEarnedEth`
  - `pleaseBroTokens[]` — same shape, beneficiary-fee side
  - `earnings.totalEth` / `earnings.creatorEarningsEth` / `earnings.pleaseBroEarningsEth` — display these ETH figures only, never the internal USD fields (`earnings.total`, `earnings.creatorEarnings`, `earnings.pleaseBroEarnings` are ranking/archetype-internal only — do not surface them)
  - `claimable.unclaimedEth` — unclaimed rewards, ETH only (same USD-internal rule for `claimable.unclaimed`)
  - `bestDay` — `{ date, eth }` or `null`
  - `dailyEarnings[]` — `{ date, eth }` timeline
  - `claimCount` — lifetime claim count
  - `longestStreakDays` — longest consecutive-earning-day streak
  - `earningsFromIndexer` — single combined ETH number (Doppler + Clanker on-chain fees, summed). Treat as one more earnings figure, additive alongside `earnings.totalEth`, not a replacement or component of it.
  - `tradingVolume` — **always present, real, live.** Shape:
    ```
    {
      totalVolumeUsd: number,
      status: "pending" | "ok",
      isComplete: boolean,
      tokensTotal, tokensComplete, tokensInProgress, tokensPending, tokensFailed: number,
      updatedAt: string
    }
    ```

## How to talk about trading volume — three real states, respond differently for each

1. **`status === "pending"`** — no volume computed yet at all (this is the very first time this wallet's been asked about). Say something like "still crunching your trading volume — ask again in a bit." Don't state a number.
2. **`status === "ok" && isComplete === true`** — real, final number. State `totalVolumeUsd` plainly as trading volume in USD (volume is never converted to ETH, unlike earnings/claimable).
3. **`status === "ok" && isComplete === false`** — a real but partial number (some tokens still resolving in the background). State `totalVolumeUsd` but frame it as "at least $X so far, still updating" — don't present it as final.

Never mention `tokensPending`/`tokensFailed`/`tokensInProgress` counts to the user directly — internal detail only, per `getTradingVolumeForBuilder`'s own doc comment ("never surface provider-level detail to the end user"). `isComplete`/`status` exist for the skill's own branching logic above, not for verbatim display.

## How to respond, general

1. Lead with the standout number — biggest single earning day, or total ETH earned, whichever is larger in relative terms.
2. Mention Please Bro tokens only if `pleaseBroTokens.length > 0`.
3. Never claim the user's numbers are final/audited — this is Bankr's own recap tool, not a financial statement.