import type { ChainId, VolumeSource } from "./types";

/**
 * In-memory cache, keyed by "chain:address". Gets the millisecond-response
 * goal working immediately with zero infra.
 *
 * Known limitation: this resets on every Railway redeploy/restart, and
 * doesn't share state across multiple API instances if you ever scale
 * horizontally. When that becomes a real problem, swap the two functions
 * below (getCached / setCached) for reads/writes against a Postgres table,
 * e.g.:
 *
 *   CREATE TABLE token_volume_cache (
 *     chain TEXT NOT NULL,
 *     address TEXT NOT NULL,
 *     volume_usd NUMERIC,
 *     source TEXT,
 *     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     PRIMARY KEY (chain, address)
 *   );
 *
 * Everything else in this module (waterfall, aggregator) stays identical —
 * only these two functions need to change.
 */

interface CacheEntry {
  volumeUsd: number;
  source: VolumeSource;
  cachedAt: number;
}

const store = new Map<string, CacheEntry>();

// Longer TTL than a typical price cache — full lifetime-volume aggregation
// per token is now a much heavier call (paginated OHLCV history, not a
// single snapshot), so cache hits matter more here than before.
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function cacheKey(chain: ChainId, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

export function getCached(
  chain: ChainId,
  address: string,
): CacheEntry | null {
  const entry = store.get(cacheKey(chain, address));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) return null;
  return entry;
}

export function setCached(
  chain: ChainId,
  address: string,
  volumeUsd: number,
  source: VolumeSource,
): void {
  store.set(cacheKey(chain, address), {
    volumeUsd,
    source,
    cachedAt: Date.now(),
  });
}
