/**
 * Item 20 -- "serve best available number" on any re-ask, whether the
 * second interaction is user-initiated (person asks again) or
 * system-initiated (a future push/automation, per item 21). Deliberately
 * capability-agnostic: this function doesn't know or care which triggered
 * it, it just answers "what do we know right now."
 *
 * Wraps getTradingVolumeForBuilder (unchanged -- still does the real
 * per-token resolution and already excludes unresolved tokens from the
 * sum, not counted as zero) and adds completion status sourced from
 * Module 9's real wallet_backfill_requests tracking (item 19), so the
 * caller can tell a genuinely-complete number apart from a partial one
 * instead of silently treating "totalVolumeUsd so far" as final.
 */
import { getTradingVolumeForBuilder } from "./index";
import { walletBackfillRequestsRepository } from "../../repositories/walletBackfillRequestsRepository";
import type { TokenRef, TradingVolumeSummary } from "./types";

export interface BestAvailableVolumeResult {
  summary: TradingVolumeSummary;
  // True only when every token this wallet has ever had a backfill request
  // recorded for is "complete" in indexed_tokens. A wallet with zero
  // recorded requests (nothing ever went cold-start -- e.g. every token
  // hit an existing indexed row on the very first ask) reports isComplete
  // = true trivially, since there's nothing outstanding to wait on.
  isComplete: boolean;
  tokensTotal: number;
  tokensComplete: number;
  tokensInProgress: number;
  tokensPending: number;
  tokensFailed: number;
}

export async function getBestAvailableVolume(
  walletAddress: string,
  tokens: TokenRef[],
): Promise<BestAvailableVolumeResult> {
  // Ensure every token carries the wallet address so cold-start paths
  // inside the waterfall can record requests correctly (item 19 wiring).
  // Callers that already set this per-token (calculateBuilderVolume.ts)
  // are left untouched; this only fills in what's missing.
  const taggedTokens = tokens.map((t) => ({
    ...t,
    walletAddress: t.walletAddress ?? walletAddress,
  }));

  const summary = await getTradingVolumeForBuilder(taggedTokens);
  const completion = await walletBackfillRequestsRepository.getCompletionSummary(walletAddress);

  // total === 0 means this wallet never triggered a single cold-start --
  // either every token was already indexed on first ask, or this wallet
  // has no tokens at all. Either way, nothing outstanding: complete.
  const isComplete = completion.total === 0 || completion.complete === completion.total;

  return {
    summary,
    isComplete,
    tokensTotal: completion.total,
    tokensComplete: completion.complete,
    tokensInProgress: completion.inProgress,
    tokensPending: completion.pending,
    tokensFailed: completion.failed,
  };
}
