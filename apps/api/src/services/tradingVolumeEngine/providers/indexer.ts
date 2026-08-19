import type {
  ProviderStopResult,
  ProviderVolumeResult,
  TokenRef,
} from "../types";
import { tokenVolumeSummaryRepository } from "../../../repositories/tokenVolumeSummaryRepository";
import { indexedTokensRepository } from "../../../repositories/indexedTokensRepository";
import { walletBackfillRequestsRepository } from "../../../repositories/walletBackfillRequestsRepository";
import { triggerBackfillIfNeeded } from "../../indexerSync/backfillTrigger";

export async function fetchIndexerVolume(
  token: TokenRef,
): Promise<ProviderVolumeResult | ProviderStopResult | null> {
  /*
   * No Robinhood indexer exists yet. Registering a backfill request or
   * checking indexed_tokens for this chain is meaningless -- there is
   * nothing that will ever complete it, and returning stopFallback here
   * would permanently block GeckoTerminal/DexPaprika/DexScreener from
   * ever resolving these tokens, even when they have real, resolvable
   * volume data right now.
   *
   * Remove this early-return once a Robinhood indexer exists.
   */
  if (token.chain === "robinhood") {
    return null;
  }

  const existing = await indexedTokensRepository.find(
    token.chain,
    token.address,
  );
  if (!existing) {
    const source = token.source ?? "unknown";
    if (source === "unknown") {
      console.warn(
        `[indexerProvider] cold-start for ${token.chain}:${token.address} has no real source ` +
          `(TokenRef.source was missing) -- registering as "unknown". This should be rare; if ` +
          `it's happening regularly, the caller building this TokenRef needs to be fixed, not this provider.`,
      );
    }
    /*
     * Record the wallet's backfill request BEFORE starting the background
     * backfill. The completion system depends on this row existing.
     *
     * Standalone token tests may not provide walletAddress, so those calls
     * intentionally skip wallet-level tracking.
     */
    if (token.walletAddress) {
      try {
        await walletBackfillRequestsRepository.recordRequest(
          token.walletAddress,
          token.chain,
          token.address,
        );
      } catch (err) {
        console.error(
          `[indexerProvider] failed to record backfill request for ` +
            `${token.walletAddress}/${token.chain}:${token.address}`,
          err,
        );
        /*
         * Do not start the backfill if we failed to establish the wallet's
         * tracking row.
         */
        return null;
      }
    }
    /*
     * Start the actual backfill after the wallet request has been recorded.
     *
     * Fire-and-forget: the volume request must not block for minutes waiting
     * for historical indexing.
     */
    triggerBackfillIfNeeded(
      token.chain,
      token.address,
      source,
    ).catch((err) => {
      console.error(
        `[indexerProvider] cold-start backfill failed for ` +
          `${token.chain}:${token.address}`,
        err,
      );
    });
    return null;
  }
  /*
   * IMPORTANT FIX 3:
   *
   * The token exists in our index, but historical indexing is incomplete.
   * Do NOT allow the waterfall to fall through to GeckoTerminal,
   * DexPaprika, or DexScreener.
   *
   * Our indexer is now the authoritative source for this token while its
   * backfill is in progress. It must remain unresolved until the backfill
   * completes.
   */
  if (existing.backfill_status !== "complete") {
    return {
      stopFallback: true,
      reason: "backfill_in_progress",
    };
  }
  const summary = await tokenVolumeSummaryRepository.get(
    token.chain,
    token.address,
  );
  if (!summary) {
    /*
     * The indexed row says complete but the aggregate is missing.
     * Do not fabricate zero volume.
     *
     * Returning null here allows the existing fallback behavior to recover
     * from a temporarily missing aggregate.
     */
    return null;
  }
  const volumeUsd = Number(summary.total_volume_usd);
  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) {
    return null;
  }
  return {
    source: "indexer",
    volumeUsd,
  };
}
