/**
 * Persistent trading-volume cache backed by Postgres (token_volume_cache).
 *
 * Replaces the previous in-memory Map, which lost all cached values on
 * every process restart/redeploy/serverless cold start -- causing every
 * wallet request to re-walk the full token list from scratch through the
 * indexer/provider waterfall every time the process cycled.
 *
 * Also caches NEGATIVE results (no provider had the token after the full
 * waterfall) under a separate, shorter TTL -- these are the calls that
 * cost 3-60s per token (external provider round-trips) and were
 * previously re-paid on every single run with no persistence at all.
 */
import { tokenVolumeCacheRepository } from "../../repositories/tokenVolumeCacheRepository";
import type { ChainId, VolumeSource } from "./types";

const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours - positive (resolved) results
const NOT_FOUND_TTL_MS = 1000 * 60 * 60; // 1 hour - negative (exhausted waterfall) results

export const NOT_FOUND_SOURCE = "not_found" as const;

export interface CacheEntry {
  volumeUsd: number | null;
  source: VolumeSource | typeof NOT_FOUND_SOURCE;
  cachedAt: number;
  resolved: boolean;
}

export async function getCached(
  chain: ChainId,
  address: string,
): Promise<CacheEntry | null> {
  const entry = await tokenVolumeCacheRepository.get(chain, address);
  if (!entry) return null;

  const isNotFound = entry.source === NOT_FOUND_SOURCE;
  const ttl = isNotFound ? NOT_FOUND_TTL_MS : TTL_MS;

  const cachedAt = entry.updatedAt.getTime();
  if (Date.now() - cachedAt > ttl) return null;

  return {
    volumeUsd: isNotFound ? null : entry.volumeUsd,
    source: entry.source as CacheEntry["source"],
    cachedAt,
    resolved: !isNotFound,
  };
}

export async function setCached(
  chain: ChainId,
  address: string,
  volumeUsd: number,
  source: VolumeSource,
): Promise<void> {
  await tokenVolumeCacheRepository.set(chain, address, volumeUsd, source);
}

// Call this when the full provider waterfall is exhausted and nothing
// resolved. Do NOT call this for a `stopFallback` result (indexer knows
// the token but backfill is incomplete) -- that case should stay cheap
// to recheck every run since it can resolve at any time.
export async function setNotFoundCached(
  chain: ChainId,
  address: string,
): Promise<void> {
  await tokenVolumeCacheRepository.set(chain, address, 0, NOT_FOUND_SOURCE);
}