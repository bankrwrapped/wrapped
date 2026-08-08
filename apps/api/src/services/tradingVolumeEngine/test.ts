/**
 * Standalone test script for the Trading Volume Engine.
 *
 * Run with:
 *   bun run apps/api/src/services/tradingVolumeEngine/test.ts <address> <chain>
 *
 * Prints what EACH provider individually returns (not just the waterfall's
 * final pick) so failures are visible per-provider, plus the waterfall's
 * actual result. Does NOT touch the cache — every run reflects live data.
 *
 * FIXED (2026-08-06): this used to call every provider individually AND
 * then separately call getTradingVolumeForBuilder(), which re-queried the
 * same providers a second time from scratch. That silently doubled the
 * real request load on every single test run and was directly responsible
 * for several tokens showing a real dollar value from the individual
 * GeckoTerminal call but "not resolved" from the "waterfall" call a few
 * hundred ms later in the same run - the second, redundant call was the
 * one getting rate-limited. The waterfall's winner is now computed
 * directly from the three results already fetched above, using the same
 * GeckoTerminal -> DexPaprika -> DexScreener priority order as
 * waterfall.ts, with zero extra network calls.
 */

import { fetchGeckoTerminalVolume } from "./providers/geckoTerminal";
import { fetchDexPaprikaVolume } from "./providers/dexPaprika";
import { fetchDexScreenerVolume } from "./providers/dexScreener";
import type { ChainId, ProviderVolumeResult, TokenRef, VolumeSource } from "./types";

function parseArgs(): TokenRef {
  const [address, chainArg] = process.argv.slice(2);

  if (!address) {
    console.error(
      "Usage: bun run test.ts <contract_address> [chain: base|robinhood]",
    );
    process.exit(1);
  }

  const chain = (chainArg ?? "base") as ChainId;
  if (chain !== "base" && chain !== "robinhood") {
    console.error(`Invalid chain "${chain}" — must be "base" or "robinhood".`);
    process.exit(1);
  }

  return { address, chain };
}

function formatUsd(value: number | null): string {
  if (value === null) return "— (not resolved)";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Mirrors waterfall.ts's PROVIDERS priority order exactly - first
// non-null result wins. Kept as a plain function (not imported from
// waterfall.ts) since waterfall.ts's resolveTokenVolume also touches the
// cache, and this script is documented to never do that.
function pickWaterfallWinner(
  gecko: ProviderVolumeResult | null,
  dexpaprika: ProviderVolumeResult | null,
  dexscreener: ProviderVolumeResult | null,
): { volumeUsd: number | null; source: VolumeSource | null } {
  if (gecko) return { volumeUsd: gecko.volumeUsd, source: gecko.source };
  if (dexpaprika) return { volumeUsd: dexpaprika.volumeUsd, source: dexpaprika.source };
  if (dexscreener) return { volumeUsd: dexscreener.volumeUsd, source: dexscreener.source };
  return { volumeUsd: null, source: null };
}

async function main() {
  const token = parseArgs();

  console.log(`\nTesting token: ${token.address} on ${token.chain}\n`);
  console.log("Querying each provider individually (bypassing cache)...\n");

  const started = Date.now();

  const [gecko, dexpaprika, dexscreener] = await Promise.all([
    timed("GeckoTerminal", () => fetchGeckoTerminalVolume(token)),
    timed("DexPaprika", () => fetchDexPaprikaVolume(token)),
    timed("DexScreener", () => fetchDexScreenerVolume(token)),
  ]);

  console.log("\n--- Individual provider results ---");
  console.log(`GeckoTerminal : ${formatUsd(gecko?.volumeUsd ?? null)}`);
  console.log(`DexPaprika    : ${formatUsd(dexpaprika?.volumeUsd ?? null)}`);
  console.log(`DexScreener   : ${formatUsd(dexscreener?.volumeUsd ?? null)}`);

  console.log("\n--- Waterfall result (computed from the results above, no extra calls) ---");
  const winner = pickWaterfallWinner(gecko, dexpaprika, dexscreener);
  console.log(`Total volume USD : ${formatUsd(winner.volumeUsd)}`);
  console.log(`Tokens resolved  : ${winner.volumeUsd !== null ? 1 : 0}/1`);
  console.log(`Source used      : ${winner.source ?? "none"}`);

  console.log(`\nTotal time: ${Date.now() - started}ms\n`);

  if (!gecko && !dexpaprika && !dexscreener) {
    console.log(
      "⚠️  GeckoTerminal, DexPaprika, and DexScreener all returned nothing. " +
        "Either the token address is wrong, the chain is wrong, or none of " +
        "them index this token — double-check the address on the relevant " +
        "explorer first.",
    );
  }

  if (gecko && dexpaprika) {
    const diff = Math.abs(gecko.volumeUsd - dexpaprika.volumeUsd);
    const pctDiff = diff / Math.max(gecko.volumeUsd, dexpaprika.volumeUsd);
    if (pctDiff > 0.15) {
      console.log(
        `⚠️  GeckoTerminal and DexPaprika disagree by ${(pctDiff * 100).toFixed(1)}% ` +
          `on lifetime volume for the same token. Worth checking whether one of ` +
          `them hit a historical-depth limit before summing — this is exactly ` +
          `the kind of silent mismatch the pool_created_at warning in ` +
          `geckoTerminal.ts is meant to catch, so check the console output ` +
          `above this line for that warning.`,
      );
    }
  }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`${label} done in ${Date.now() - start}ms`);
  return result;
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
