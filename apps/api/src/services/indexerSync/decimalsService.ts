import { env } from "../../config/env";
import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";

const DECIMALS_SELECTOR = "0x313ce567";

async function fetchDecimalsFromChain(tokenAddress: string): Promise<number> {
  const res = await fetch(env.BASE_RPC_URL, {
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
    throw new Error(`Base RPC decimals() call failed: ${res.status} for ${tokenAddress}`);
  }
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) {
    throw new Error(`Base RPC decimals() error for ${tokenAddress}: ${json.error.message}`);
  }
  if (!json.result) {
    throw new Error(`Base RPC decimals() returned no result for ${tokenAddress}`);
  }
  return parseInt(json.result, 16);
}

export async function getDecimals(chain: string, tokenAddress: string): Promise<number> {
  if (chain !== "base") {
    throw new Error(
      `getDecimals: only 'base' is wired to an RPC right now — got chain=${chain}`,
    );
  }
  const existing = await indexedTokensRepository.find(chain, tokenAddress);
  if (existing?.decimals !== null && existing?.decimals !== undefined) {
    return existing.decimals;
  }
  const decimals = await fetchDecimalsFromChain(tokenAddress);
  await indexedTokensRepository.setDecimals(chain, tokenAddress, decimals);
  return decimals;
}
