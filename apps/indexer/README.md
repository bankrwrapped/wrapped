# apps/indexer

On-chain indexer for **Base** (chain 8453), built with [Envio HyperIndex](https://envio.dev). It's fully independent of `apps/indexer-robinhood`, with its own config, schema and database. Don't share files between the two: doing that caused data loss earlier in the project.

## What it indexes

| Contract | Events | Produces |
| --- | --- | --- |
| Doppler `Airlock` | `Create` | `KnownAsset` (launched token) |
| Uniswap v4 `PoolManager` | `Initialize`, `Swap` | `WatchedPool` (every pool; launch side resolved lazily), `IndexedSwap` |
| Doppler `StreamableFeesLockerV2` | `Collect`, `Release` | `IndexedFeeEvent` with `launchedToken` |
| Clanker v4 factory | `TokenCreated` | `KnownToken`, `WatchedPool` |
| `ClankerFeeLocker` | `StoreTokens`, `ClaimTokens`, `ClaimTokensPermissioned` | `IndexedFeeEvent` |
| Clanker LP lockers | `ClaimedRewards` | Attributes the transaction's `StoreTokens` rows to their launch |

**Clanker attribution.** A `StoreTokens` deposit only names the fee token (usually WETH), not the launch that earned it. The LP locker's `_collectRewards(token)` stores fees for each recipient and then emits `ClaimedRewards(token)` in the same transaction. The indexer queues each deposit and stamps it with that `launchedToken` (`PendingFeeAttribution`). Claims can't be tied to a launch, so the API counts Clanker fees at accrual (`StoreTokens`).

Pools are matched by currency address, not hook address, because `poolOrHook` isn't reliably a real hook. All addresses are stored lowercased.

## Run

```bash
bun install
bunx envio codegen
bunx envio dev        # local Hasura GraphQL once running
bun run test          # handler tests against an in-memory store
```

GraphQL root fields are unprefixed: `IndexedSwap`, `IndexedFeeEvent`, `WatchedPool`, plus Envio's `chain_metadata`.

## Notes

- **Backfill time:** a full backfill from the start block takes about 2 hours via HyperSync. After that the indexer streams in realtime.
- **Changes need a re-index.** Any change to `EventHandlers.ts`, `schema.graphql` or `config.yaml` needs `codegen` and a fresh re-index before the running indexer reflects it.
- **Old Clanker launches aren't covered.** Only Clanker v4 is indexed; v3-era launches are missing.
