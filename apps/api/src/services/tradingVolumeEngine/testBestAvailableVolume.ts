/**
 * Item 20 manual test script -- exercises getBestAvailableVolume end-to-end
 * against a real wallet's real deployed tokens, same data-fetch pattern as
 * calculateBuilderVolume.ts (Bankr's creator-fees endpoint), but calling
 * the new item-20 entry point instead of getTradingVolumeForBuilder directly,
 * so completion status (isComplete, tokensComplete/InProgress/Pending/Failed)
 * actually gets exercised -- which calculateBuilderVolume.ts does NOT do.
 *
 * Run with:
 *   bun run apps/api/src/services/tradingVolumeEngine/testBestAvailableVolume.ts <wallet_address>
 */
import { getBestAvailableVolume } from "./getBestAvailableVolume";
import type { ChainId, TokenRef, TokenSource } from "./types";

const BANKR_API_BASE = "https://api.bankr.bot";

interface BankrTokenEntry {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: string;
  source?: string;
}

interface CreatorFeesResponse {
  address: string;
  tokens: BankrTokenEntry[];
}

function normalizeSource(raw: string | undefined): TokenSource {
  if (raw === "doppler" || raw === "clanker") return raw;
  if (raw !== undefined) {
    console.warn(`[testBestAvailableVolume] unrecognized token source "${raw}" -- treating as unknown`);
  }
  return "unknown";
}

async function fetchDeployedTokens(wallet: string): Promise<TokenRef[]> {
  const res = await fetch(
    `${BANKR_API_BASE}/public/doppler/creator-fees/${wallet}?days=90`,
  );
  if (!res.ok) {
    throw new Error(`Bankr creator-fees request failed: ${res.status}`);
  }
  const data = (await res.json()) as CreatorFeesResponse;
  const supported: TokenRef[] = [];
  const skipped: BankrTokenEntry[] = [];
  for (const t of data.tokens) {
    if (t.chain === "base" || t.chain === "robinhood") {
      supported.push({
        address: t.tokenAddress,
        chain: t.chain as ChainId,
        symbol: t.symbol,
        name: t.name,
        source: normalizeSource(t.source),
        // walletAddress intentionally omitted here -- getBestAvailableVolume
        // fills it in from the wallet param itself, per its own doc comment.
      });
    } else {
      skipped.push(t);
    }
  }
  if (skipped.length > 0) {
    console.log(
      `Skipped ${skipped.length} token(s) on unsupported chain(s): ` +
        skipped.map((t) => `${t.symbol} (${t.chain})`).join(", "),
    );
  }
  return supported;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

async function main() {
  const wallet = process.argv[2];
  if (!wallet) {
    console.error("Usage: bun run testBestAvailableVolume.ts <wallet_address>");
    process.exit(1);
  }

  console.log(`\nFetching deployed tokens for ${wallet} from Bankr...\n`);
  const tokens = await fetchDeployedTokens(wallet);
  console.log(`Found ${tokens.length} supported token(s):`);
  for (const t of tokens) {
    console.log(`  ${t.symbol ?? "?"} (${t.name ?? "?"}) — ${t.address} on ${t.chain} [source: ${t.source}]`);
  }

  console.log(`\nCalling getBestAvailableVolume for ${tokens.length} token(s)...\n`);
  const result = await getBestAvailableVolume(wallet, tokens);

  console.log("--- Per-token results ---");
  for (const r of result.summary.perToken) {
    const label = r.token.symbol ?? r.token.address;
    if (r.resolved && r.volumeUsd !== null) {
      console.log(`  ${label}: ${formatUsd(r.volumeUsd)} (source: ${r.source})`);
    } else {
      console.log(`  ${label}: not resolved (excluded from total)`);
    }
  }

  console.log("\n--- Volume Summary ---");
  console.log(`Total volume USD : ${formatUsd(result.summary.totalVolumeUsd)}`);
  console.log(`Tokens resolved  : ${result.summary.tokensResolved}/${result.summary.tokensQueried}`);
  console.log(`Tokens excluded  : ${result.summary.tokensExcluded}`);

  console.log("\n--- Completion Status (item 20) ---");
  console.log(`isComplete       : ${result.isComplete}`);
  console.log(`tokensTotal      : ${result.tokensTotal}`);
  console.log(`tokensComplete   : ${result.tokensComplete}`);
  console.log(`tokensInProgress : ${result.tokensInProgress}`);
  console.log(`tokensPending    : ${result.tokensPending}`);
  console.log(`tokensFailed     : ${result.tokensFailed}`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
