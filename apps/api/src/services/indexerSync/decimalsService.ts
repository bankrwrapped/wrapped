import { env } from "../../config/env";
import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";

const DECIMALS_SELECTOR = "0x313ce567";

const RPC_URLS: Record<string, string> = {
  base: env.BASE_RPC_URL,
  robinhood: env.ROBINHOOD_RPC_URL,
};

async function fetchDecimalsFromChain(chain: string, tokenAddress: string): Promise<number> {
  const rpcUrl = RPC_URLS[chain];
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: tokenAddress, data: DECIMALS_SELECTOR }, "latest"],
    }),
  });
  if (!res.ok) {
    throw new Error(`${chain} RPC decimals() call failed: ${res.status} for ${tokenAddress}`);
  }
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) {
    throw new Error(`${chain} RPC decimals() error for ${tokenAddress}: ${json.error.message}`);
  }
  if (!json.result) {
    throw new Error(`${chain} RPC decimals() returned no result for ${tokenAddress}`);
  }
  return parseInt(json.result, 16);
}

export async function getDecimals(chain: string, tokenAddress: string): Promise<number> {
  if (!(chain in RPC_URLS)) {
    throw new Error(
      `getDecimals: no RPC wired for chain=${chain} — supported: ${Object.keys(RPC_URLS).join(", ")}`,
    );
  }
  const existing = await indexedTokensRepository.find(chain, tokenAddress);
  if (existing?.decimals !== null && existing?.decimals !== undefined) {
    return existing.decimals;
  }
  const decimals = await fetchDecimalsFromChain(chain, tokenAddress);
  await indexedTokensRepository.setDecimals(chain, tokenAddress, decimals);
  return decimals;
}
