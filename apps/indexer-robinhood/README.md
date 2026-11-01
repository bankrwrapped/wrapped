# apps/indexer-robinhood

On-chain indexer for **Robinhood Chain** (chain 4663), built with [Envio HyperIndex](https://envio.dev). It runs separately from `apps/indexer` (Base), with its own config, schema and database, but its Doppler handlers are the same code: change both together.

## Data source

HyperSync now serves chain 4663 (`https://4663.hypersync.xyz`), so this indexer needs only `ENVIO_API_TOKEN`, like Base. The old paid-RPC blocker is gone.

## What it indexes

Doppler only. Clanker isn't deployed on Robinhood Chain.

| Source | Events | Writes |
|---|---|---|
| `Airlock` | `Create` | `KnownAsset` (the launch, its initializer and create tx) |
| `PoolManager` | `Initialize`, `Swap` | `WatchedPool` (resolved lazily, because `Airlock.Create` logs after `Initialize` in the same tx), `IndexedSwap` |
| `DopplerFees` (wildcard) | `Collect`, `Release` | `IndexedFeeEvent` with `launchedToken` and `emitter` |
| `DopplerFees` (wildcard) | `FeeScheduleSet`, `SetDopplerHook` | `DopplerHookOf` |

Fee events count only when the launch's own fee holder emitted them. That means the fee locker, the launch's initializer, or its Rehype hook. Every recent Robinhood launch uses `DopplerHookInitializer` plus Rehype hooks, never the locker. Rejected emitters for Bankr pools are counted in `RejectedFeeEmitter`. See `apps/indexer/README.md` for the full rule. Addresses are stored lowercased.

## Run

```bash
bun install
bunx envio codegen
bunx envio dev
bun run test
```

## Notes

- **Checkpointing:** Robinhood Chain is an Arbitrum Orbit chain, not OP Stack. Use the Nitro RPC's `"finalized"` block tag for checkpointing, not Base's logic.
- The API reads this indexer only when `ROBINHOOD_INDEXER_ENABLED=true`, and its `launchedToken` select assumes this schema. Re-index before enabling it.
