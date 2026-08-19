import { triggerBackfillIfNeeded } from "../services/indexerSync/backfillTrigger";
import { tokenVolumeSummaryRepository } from "../repositories/tokenVolumeSummaryRepository";
import { indexedTokensRepository } from "../repositories/indexedTokensRepository";

const tokenAddress = process.argv[2];
if (!tokenAddress) {
  console.error("Usage: bun run src/scripts/testBackfill.ts <tokenAddress>");
  process.exit(1);
}

async function main() {
  console.log(`Starting backfill for base:${tokenAddress}...`);
  const start = Date.now();

  // Matches Module 7's real cold-start path -- creates the pending row first,
  // THEN backfills. Calling backfillToken() directly (as this script did
  // before) skips row creation, since backfillToken only UPDATEs, never
  // INSERTs -- confirmed live 2026-08-09.
  await triggerBackfillIfNeeded("base", tokenAddress, "doppler");

  const elapsedMs = Date.now() - start;
  const summary = await tokenVolumeSummaryRepository.get("base", tokenAddress);
  const tokenRow = await indexedTokensRepository.find("base", tokenAddress);

  console.log(`Done in ${elapsedMs}ms`);
  console.log("token_volume_summary:", summary);
  console.log("indexed_tokens status:", tokenRow?.backfill_status, "checkpoint:", tokenRow?.backfill_checkpoint_block, "decimals:", tokenRow?.decimals);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
