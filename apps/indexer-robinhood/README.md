# apps/indexer-robinhood

On-chain indexer for **Robinhood Chain** (chain 4663), built with [Envio HyperIndex](https://envio.dev). It's fully independent of `apps/indexer` (Base), with its own config, schema and database. Don't share files between the two.

## Status: paused

The backfill is paused, not broken. Free-tier RPC can't sustain a full backfill on this chain (tried with four providers), so resuming needs a paid RPC tier. Progress so far is saved and resumes cleanly; it only needs a new RPC URL.

While it's paused, the API skips this chain for wallets that have no Bankr launches on it, so it doesn't affect Base-only users.

## What it indexes

Doppler only (`Airlock.Create`, `PoolManager.Initialize`/`Swap`, `StreamableFeesLockerV2.Collect`/`Release`). Clanker isn't deployed on Robinhood Chain. Beneficiary addresses are stored lowercased.

## Run

```bash
bun install
bunx envio codegen
bunx envio dev
bun run test
```

## Notes

- **Checkpointing:** Robinhood Chain is an Arbitrum Orbit chain, not OP Stack. Use the Nitro RPC's `"finalized"` block tag for checkpointing, not Base's logic.
- **Why free RPC can't keep up:** the chain isn't HyperSync-supported, so this indexer is RPC-bound with any provider.
