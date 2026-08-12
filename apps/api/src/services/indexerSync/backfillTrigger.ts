import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";
import { backfillToken } from "./syncJob";

// TEMPORARY (2026-08-08): runs synchronous, in-request. Base's real per-token
// backfill time hasn't been measured yet, so per the playbook this is NOT the
// final UX decision — don't treat sync-vs-background as settled. Revisit once
// Module 2's Base backfill completes and a real single-token timing number exists.
export async function triggerBackfillIfNeeded(
  chain: string,
  tokenAddress: string,
  source: string,
): Promise<void> {
  const existing = await indexedTokensRepository.find(chain, tokenAddress);
  if (existing) return;

  await indexedTokensRepository.createPending(chain, tokenAddress, source);
  await backfillToken(chain, tokenAddress);
}
