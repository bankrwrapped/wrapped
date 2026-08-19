import { wrappedService } from "../services/wrappedService";
import { wrappedCacheRepository } from "../repositories/wrappedCacheRepository";
import { resolveTokenVolume } from "../services/tradingVolumeEngine/waterfall";
import type { TokenRef, ChainId } from "../services/tradingVolumeEngine/types";

const HANDLE = process.argv[2] ?? "basedkabeer";
const TARGET_ADDRESS = (process.argv[3] ?? "0x3b105791b5f818ece17559ee0111840f63e74b07").toLowerCase();

async function main() {
  const match = await wrappedService.resolveWallet(HANDLE);
  if (!match) {
    console.error(`no match for handle=${HANDLE}`);
    process.exit(1);
  }
  console.log(`wallet=${match.evmAddress} (${HANDLE})`);

  const cached = await wrappedCacheRepository.findByWallet(match.evmAddress);
  if (!cached) {
    console.error(`no cached payload for wallet=${match.evmAddress} — run the live /api/wrapped fetch first`);
    process.exit(1);
  }

  const tokenEntry = cached.payload.tokens.find(
    (t) => t.tokenAddress.toLowerCase() === TARGET_ADDRESS
  );
  if (!tokenEntry) {
    console.log(`target address ${TARGET_ADDRESS} not found in this wallet's token list (${cached.payload.tokens.length} tokens total)`);
    process.exit(0);
  }
  console.log(`found in token list: symbol=${tokenEntry.symbol} name=${tokenEntry.name} chain=${tokenEntry.chain} source=${tokenEntry.source}`);

  const ref: TokenRef = {
    address: tokenEntry.tokenAddress,
    chain: tokenEntry.chain as ChainId,
    symbol: tokenEntry.symbol,
    name: tokenEntry.name,
    walletAddress: match.evmAddress,
  };

  const start = Date.now();
  const result = await resolveTokenVolume(ref);
  const elapsed = Date.now() - start;
  console.log(`resolveTokenVolume took=${elapsed}ms`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("script failed:", err);
  process.exit(1);
});
