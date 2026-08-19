import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";
import { backfillToken } from "./syncJob";

// How long a token can sit with no progress (no claim renewal, no
// checkpoint movement) before it's considered dead and eligible for retry.
// Exported so backfillSweep.ts uses the exact same threshold -- one
// definition of "stale", not two that could drift apart.
export const STALE_THRESHOLD_MS = 15 * 60 * 1000;

// Was: "if a row already exists at all, do nothing." That silently
// abandoned any token whose backfill died mid-run (crash, dev-server
// restart, killed request) -- once a row existed in ANY status, nothing
// would ever look at it again. Now: existing 'failed' or stale
// 'pending'/'in_progress' rows are retried via an atomic claim, so a dead
// job actually gets picked back up instead of being stuck forever.
export async function triggerBackfillIfNeeded(
  chain: string,
  tokenAddress: string,
  source: string,
): Promise<void> {
  const existing = await indexedTokensRepository.find(chain, tokenAddress);

  if (!existing) {
    await indexedTokensRepository.createPending(chain, tokenAddress, source);
  } else if (existing.backfill_status === "complete") {
    return; // genuinely done, nothing to do
  }

  // Atomic claim: only actually flips to 'in_progress' if the row is
  // failed, or pending/in_progress-but-stale. If another request or the
  // sweep already claimed it a moment ago, this returns false and we do
  // nothing -- no duplicate backfill runs for the same token at once.
  const won = await indexedTokensRepository.claimForBackfill(chain, tokenAddress, STALE_THRESHOLD_MS);
  if (!won) return;

  await backfillToken(chain, tokenAddress);
}