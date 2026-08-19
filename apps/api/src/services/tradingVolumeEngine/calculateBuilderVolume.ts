/**
 * Standalone script: computes TOTAL trading volume across ALL of a
 * builder's deployed tokens, using the real Trading Volume Engine
 * (getTradingVolumeForBuilder) rather than testing one token at a time.
 *
 * Pulls the deployed-token list from Bankr's own creator-fees endpoint
 * (same endpoint wrappedService.ts already uses in production), then
 * runs every token through the waterfall and sums the resolved results.
 *
 * Run with:
 *   bun run apps/api/src/services/tradingVolumeEngine/calculateBuilderVolume.ts <wallet_address>
 */
import { getTradingVolumeForBuilder } from "./index";
import type { ChainId, TokenRef, TokenSource } from "./types";

const BANKR_API_BASE = "https://api.bankr.bot";

interface BankrTokenEntry {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: string;
  // Real field on Bankr's own response -- wrappedService.ts already reads
  // this same field off the same API (scoped there to a Clanker-dedupe
  // workaround). Bankr fully moved to Doppler; Clanker is not a live
  // launchpad anymore, but some wallets still hold tokens deployed back
  // when it was, so this can genuinely be either value on real data.
  source?: string;
}

interface CreatorFeesResponse {
  address: string;
  tokens: BankrTokenEntry[];
}

function normalizeSource(raw: string | undefined): TokenSource {
  if (raw === "doppler" || raw === "clanker") return raw;
  // Genuinely missing/unrecognized -- NOT a default for the common case.
  // Every token this endpoint returns should carry a real source; this
  // path firing on real data is itself worth investigating, not silently
  // accepting.
  if (raw !== undefined) {
    console.warn(`[calculateBuilderVolume] unrecognized token source "${raw}" -- treating as unknown`);
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
  // Engine only supports "base" | "robinhood" per ChainId. Skip anything
  // else defensively rather than crash - matches the engine's own
  // "exclude, don't zero, don't crash" philosophy.
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
        walletAddress: wallet,
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
    console.error(
      "Usage: bun run calculateBuilderVolume.ts <wallet_address>",
    );
    process.exit(1);
  }
  console.log(`\nFetching deployed tokens for ${wallet} from Bankr...\n`);
  const tokens = await fetchDeployedTokens(wallet);
  console.log(`Found ${tokens.length} supported token(s):`);
  for (const t of tokens) {
    console.log(`  ${t.symbol ?? "?"} (${t.name ?? "?"}) — ${t.address} on ${t.chain} [source: ${t.source}]`);
  }
  console.log(`\nQuerying Trading Volume Engine for all ${tokens.length} token(s)...\n`);
  const summary = await getTradingVolumeForBuilder(tokens);
  console.log("--- Per-token results ---");
  for (const r of summary.perToken) {
    const label = r.token.symbol ?? r.token.address;
    if (r.resolved && r.volumeUsd !== null) {
      console.log(`  ${label}: ${formatUsd(r.volumeUsd)} (source: ${r.source})`);
    } else {
      console.log(`  ${label}: not resolved (excluded from total)`);
    }
  }
  console.log("\n--- Summary ---");
  console.log(`Total volume USD : ${formatUsd(summary.totalVolumeUsd)}`);
  console.log(`Tokens resolved  : ${summary.tokensResolved}/${summary.tokensQueried}`);
  console.log(`Tokens excluded  : ${summary.tokensExcluded}`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
