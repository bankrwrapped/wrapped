# apps/indexer

On-chain indexer for **Base** (chain 8453), built with [Envio HyperIndex](https://envio.dev). It's fully independent of `apps/indexer-robinhood`, with its own config, schema and database. Don't share files between the two: doing that caused data loss earlier in the project.

## What it indexes

| Contract | Events | Produces |
| --- | --- | --- |
| Doppler `Airlock` | `Create` | `KnownAsset` (launched token) |
| Uniswap v4 `PoolManager` | `Initialize`, `Swap` | `WatchedPool` (every pool; launch side resolved lazily), `IndexedSwap` |
| `DopplerFees` (wildcard, any contract) | `Collect`, `Release` | `IndexedFeeEvent` with `launchedToken` and `emitter`, only from the launch's own fee holder |
| `DopplerFees` (wildcard) | `FeeScheduleSet`, `SetDopplerHook` | `DopplerHookOf`: which Rehype hook a launch uses |
| Clanker v4 factory | `TokenCreated` (Bankr's deployer only) | `KnownToken`, `WatchedPool` |
| `ClankerFeeLocker` | `StoreTokens`, `ClaimTokens`, `ClaimTokensPermissioned` | `IndexedFeeEvent` |
| Clanker LP lockers (`ClankerLpLocker`, `ClankerLpLockerFeeConversion`) | `ClaimedRewards` | Attributes the transaction's `StoreTokens` rows to their launch |
| Clanker v3.1 factory | `TokenCreated` (Bankr's deployer only) | `ClankerV31Launch` |
| Clanker v3.1 `LpLockerv2` | `ClaimedRewards` | `IndexedFeeEvent` (creator share, Bankr v3.1 launches only) |

Doppler creator fees are paid by whichever contract holds the pool's fees: the `StreamableFeesLockerV2` for migrated pools, the launch's initializer (`DopplerHookInitializer`, multicurve), or a Rehype hook, of which Doppler ships a new version every few weeks. Recent Bankr launches pay from the last two and never touch the locker. So fee events are read from every contract and an event counts only when its emitter is a known locker (`DOPPLER_FEE_LOCKERS` in the handler), the launch's `initializer` from `Airlock.Create`, the hook that set the pool's fee schedule inside the launch's own create transaction, or a hook the initializer attached later (`SetDopplerHook`). Anything else for a Bankr pool is counted in `RejectedFeeEmitter`; check that table after a re-index, since a large count there means a fee holder these rules miss.

Known gap: legacy Rehype pools with no fee beneficiaries send fees to the buyback address without any event, so nothing can index them.

Only Bankr's Clanker launches are registered: `TokenCreated` from any deployer other than Bankr's (`BANKR_CLANKER_DEPLOYERS`) is skipped, on v4 and v3.1 alike. `StoreTokens` is accepted only from the LP lockers listed under `ClankerLpLocker` in `config.yaml`; the handler reads that list, so a new locker only needs adding there.

**Clanker attribution.** A `StoreTokens` deposit only names the fee token (usually WETH), not the launch that earned it. The LP locker's `_collectRewards(token)` stores fees for each recipient and then emits `ClaimedRewards(token)` in the same transaction. The indexer queues each deposit and stamps it with that `launchedToken` (`PendingFeeAttribution`, deleted once attributed). Claims can't be tied to a launch, so the API counts Clanker fees at accrual (`StoreTokens`).

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

- **Start block:** the chain starts at 27733337 (the Clanker v3.1 factory's deployment). Every other contract keeps its own start block (28415516, Airlock's deployment), so only the v3.1 contracts read the earlier range.
- **Backfill time:** a full backfill took about 2 hours via HyperSync before the v3.1 contracts were added; expect somewhat longer now. After that the indexer streams in realtime.
- **Changes need a re-index.** Any change to `EventHandlers.ts`, `schema.graphql` or `config.yaml` needs `codegen` and a fresh re-index before the running indexer reflects it.
- **Clanker coverage:** Bankr's v3.1 (2025-03-18 to about July 2025) and v4 launches are indexed. Earlier Clanker versions aren't, and Bankr didn't launch through them.

## Starting on Railway

The start command is `bun run scripts/start.ts`, not `envio start`. It runs `envio start`, which resumes where indexing left off. Only if Envio refuses because the stored data is incompatible (an older Envio version, or a config or schema change) does it start over, once, with `envio start -r`. A crash restart therefore resumes instead of wiping hours of progress. Set `ENVIO_AUTO_RESET=false` to make it stay down instead of starting over. The wrapper passes Railway's stop signal (`SIGTERM`/`SIGINT`) on to envio so it shuts down cleanly, and never starts over after a stop signal.

