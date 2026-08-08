import { resolveTokenVolume } from "./waterfall";
import type { TokenRef, TokenVolumeResult, TradingVolumeSummary } from "./types";

/**
 * Entry point the rest of the API (and eventually the skill job) calls.
 * Consumes a builder's deployed token list, returns exactly the one field
 * the Wrapped product is meant to use: totalVolumeUsd. The per-token detail
 * is included for logging/debugging only — never surface provider-level
 * detail to the end user, per the original spec.
 *
 * Tokens that no provider could resolve are excluded from the sum, not
 * counted as zero (confirmed decision).
 *
 * FULLY SERIAL, one token at a time (2026-08-06): confirmed empirically
 * that even BATCH_SIZE=5 fails completely on the very first batch,
 * including tokens proven to resolve reliably in isolation. GeckoTerminal's
 * free/keyless tier does not tolerate 5 concurrent requests, let alone 53.
 * Serial processing is the one setting proven to work every time so far -
 * slower, but correct. A safe concurrency level above 1 can be explored
 * later from this known-working baseline, not guessed at again.
 *
 * TEMPORARY (2026-08-06): per-token console logging kept for now to make
 * multi-minute runs visible instead of silent. Can be removed/quieted once
 * this is wired into the real skill pipeline.
 */
const DELAY_BETWEEN_TOKENS_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTradingVolumeForBuilder(
  tokens: TokenRef[],
): Promise<TradingVolumeSummary> {
  const results: TokenVolumeResult[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const label = token.symbol ?? token.address;
    const start = Date.now();

    const result = await resolveTokenVolume(token);
    results.push(result);

    console.log(
      `[${i + 1}/${tokens.length}] ${label}: ${result.resolved ? result.source : "null"} (${Date.now() - start}ms)`,
    );

    if (i < tokens.length - 1) {
      await sleep(DELAY_BETWEEN_TOKENS_MS);
    }
  }

  const resolved = results.filter((r) => r.resolved && r.volumeUsd !== null);
  const totalVolumeUsd = resolved.reduce(
    (sum, r) => sum + (r.volumeUsd ?? 0),
    0,
  );

  return {
    totalVolumeUsd,
    tokensQueried: tokens.length,
    tokensResolved: resolved.length,
    tokensExcluded: tokens.length - resolved.length,
    perToken: results,
  };
}

export type {
  TokenRef,
  TokenVolumeResult,
  TradingVolumeSummary,
  ChainId,
  VolumeSource,
} from "./types";
