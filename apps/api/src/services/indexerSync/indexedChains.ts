import { env } from "../../config/env";

// Chains whose volume comes from our own indexer (backfill + refresh sweeps,
// the indexer volume provider). Base always; Robinhood once its index has
// caught up and ROBINHOOD_INDEXER_ENABLED=true.
export function indexedChains(): string[] {
  return env.ROBINHOOD_INDEXER_ENABLED ? ["base", "robinhood"] : ["base"];
}
