# apps/indexer-base

On-chain indexer for **Base**. [Envio HyperIndex](https://envio.dev).

Fully independent from `apps/indexer-robinhood` — separate config, schema, and database. Do not share files between the two; that caused real data-loss incidents earlier in this project.

## What it watches

- Doppler launches (`Airlock.Create`, `PoolManager.Initialize`, `Swap`) — matched to a token by currency address, not by hook address (hook address isn't reliable across all Doppler initializer variants)
- Clanker launches and fee events (`StoreTokens`, `ClaimTokens`, `ClaimTokensPermissioned`)

## Run

```bash
bun install
bunx envio codegen
bunx envio dev
```

GraphQL served locally via Hasura once running. Table names are permanently fixed via `pg_set_table_customization` — always prefixed `base_` (e.g. `base_KnownAsset`, `base_IndexedSwap`), regardless of what else is tracked alongside it.

## Notes

- Real backfill takes ~2 hours from genesis via HyperSync.
- Runs in realtime/streaming mode after backfill completes — safe to leave running (Base's HyperSync usage is cheap), not a hard requirement.
- Any change to `EventHandlers.ts` or `schema.graphql` should be treated as needing a fresh `codegen` + restart before trusting the running indexer reflects it — verify, don't assume.