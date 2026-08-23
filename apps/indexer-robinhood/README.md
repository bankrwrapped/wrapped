# apps/indexer-robinhood

On-chain indexer for **Robinhood Chain**. [Envio HyperIndex](https://envio.dev).

Fully independent from `apps/indexer-base` — separate config, schema, and database. Do not share files between the two.

## Status: paused

Backfill is paused, not broken. Free-tier RPC access cannot sustain a full backfill on this chain (confirmed after trying four different providers) — resuming requires a paid RPC tier. Real progress made so far is saved and resumes cleanly once that's decided; no rework needed, just swap the RPC URL.

## What it watches

- Doppler launches only (Clanker is not deployed on Robinhood Chain)

## Run

```bash
bun install
bunx envio codegen
bunx envio dev
```

Table names fixed via `pg_set_table_customization`, always prefixed `robinhood_` (e.g. `robinhood_KnownAsset`, `robinhood_IndexedSwap`).

## Notes

- Robinhood Chain is an Arbitrum Orbit chain, not OP-stack — use the Nitro RPC's `"finalized"` block tag for checkpointing, not Base's checkpoint logic.
- Not HyperSync-supported — this indexer is RPC-bound regardless of provider, which is the real reason free tiers can't keep up.