import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";
import { backfillToken } from "./syncJob";
import { STALE_THRESHOLD_MS } from "./backfillTrigger";

// backfillToken() currently runs synchronous, in-request (see syncJob.ts /
// backfillTrigger.ts comments) -- if the triggering request dies (timeout,
// cancel, dev-server restart) mid-run, the job vanishes with it. This sweep
// is the safety net: it runs independently of any user request, on its own
// timer, and retries anything that looks dead. It does NOT replace moving
// backfill to a real background job/queue -- that's the actual long-term
// fix for "don't run this in-request at all" -- but it means a dead job
// gets recovered within one sweep interval instead of staying stuck
// forever with no one ever looking at it again.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_CONCURRENCY = 3; // keep this well under whatever RPC/pricing rate limits allow

async function reconcileStuckBackfills(chain: string): Promise<void> {
  const candidates = await indexedTokensRepository.listStuckCandidates(chain, STALE_THRESHOLD_MS);
  if (candidates.length === 0) return;

  console.log(`[backfillSweep] ${candidates.length} stuck/failed candidate(s) for chain=${chain}`);

  for (let i = 0; i < candidates.length; i += SWEEP_CONCURRENCY) {
    const batch = candidates.slice(i, i + SWEEP_CONCURRENCY);
    await Promise.all(
      batch.map(async (t) => {
        // Re-claim per token even though listStuckCandidates just read
        // this -- a live user request could have claimed the same token
        // in the gap between that read and this retry. claimForBackfill's
        // atomic UPDATE...WHERE...RETURNING is what actually prevents a
        // double-run here, not the fact that we read it as a candidate.
        const won = await indexedTokensRepository.claimForBackfill(chain, t.token_address, STALE_THRESHOLD_MS);
        if (!won) return;
        try {
          await backfillToken(chain, t.token_address);
        } catch (err) {
          console.error(`[backfillSweep] retry failed for ${chain}:${t.token_address}`, err);
        }
      }),
    );
  }
}

export function startBackfillSweep(chain: string): void {
  // Run once immediately on boot -- this is what actually recovers
  // WHYNOT and the rest of the currently-stuck tokens without waiting a
  // full 5 minutes for the first tick.
  reconcileStuckBackfills(chain).catch((err) =>
    console.error(`[backfillSweep] initial sweep failed for chain=${chain}`, err),
  );

  setInterval(() => {
    reconcileStuckBackfills(chain).catch((err) =>
      console.error(`[backfillSweep] periodic sweep failed for chain=${chain}`, err),
    );
  }, SWEEP_INTERVAL_MS);
}