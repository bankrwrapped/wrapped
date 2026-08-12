import type { ProviderVolumeResult, TokenRef } from "../types";
import { tokenVolumeSummaryRepository } from "../../../repositories/tokenVolumeSummaryRepository";
import { indexedTokensRepository } from "../../../repositories/indexedTokensRepository";
import { walletBackfillRequestsRepository } from "../../../repositories/walletBackfillRequestsRepository";
import { triggerBackfillIfNeeded } from "../../indexerSync/backfillTrigger";

export async function fetchIndexerVolume(
  token: TokenRef,
): Promise<ProviderVolumeResult | null> {
  const existing = await indexedTokensRepository.find(token.chain, token.address);

  if (!existing) {
    const source = token.source ?? "unknown";
    if (source === "unknown") {
      // eslint-disable-next-line no-console
      console.warn(
        `[indexerProvider] cold-start for ${token.chain}:${token.address} has no real source ` +
        `(TokenRef.source was missing) -- registering as "unknown". This should be rare; if it's ` +
        `happening regularly, the caller building this TokenRef needs to be fixed, not this provider.`,
      );
    }

    // Item 19/20 wiring: record this as a real backfill request so
    // getCompletionSummary() has something to report on re-ask. Only
    // possible when walletAddress is present -- standalone test scripts
    // (test.ts) resolve a single token with no wallet context, and that's
    // legitimate; skip recording rather than record garbage.
    if (token.walletAddress) {
      walletBackfillRequestsRepository
        .recordRequest(token.walletAddress, token.chain, token.address)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(
            `[indexerProvider] failed to record backfill request for ` +
            `${token.walletAddress}/${token.chain}:${token.address}`,
            err,
          );
        });
    }

    // Fire-and-forget: a slow/failed cold-start backfill must not take
    // down this request. Errors are logged, not thrown.
    triggerBackfillIfNeeded(token.chain, token.address, source).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[indexerProvider] cold-start backfill failed for ${token.chain}:${token.address}`,
        err,
      );
    });
    return null;
  }

  if (existing.backfill_status !== "complete") {
    return null;
  }

  const summary = await tokenVolumeSummaryRepository.get(token.chain, token.address);
  if (!summary) return null;

  const volumeUsd = Number(summary.total_volume_usd);
  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return null;

  return { source: "indexer", volumeUsd };
}
