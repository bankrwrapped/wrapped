import { env } from "../config/env";

// Read-only eth_call on Base, with the ABI helpers the hand-encoded calls in
// clankerFeeLocker.ts and clankerV31.ts need (no ABI library in this app).
// `from` lets a call run as a contract - e.g. simulating Uniswap's collect
// as the LP locker that owns the position; nothing is ever sent.

const TIMEOUT_MS = 10_000;

export async function baseEthCall(
  to: string,
  data: string,
  opts: { from?: string; block?: bigint } = {},
): Promise<string> {
  const blockTag = opts.block === undefined ? "latest" : "0x" + opts.block.toString(16);
  const call: Record<string, string> = { to, data };
  if (opts.from) call.from = opts.from;
  const res = await fetch(env.BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [call, blockTag] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`eth_call failed: ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call error: ${json.error.message}`);
  if (!json.result || json.result === "0x") throw new Error("eth_call returned no result");
  return json.result;
}

// 32-byte ABI word for an address or uint.
export function abiWord(value: string | bigint): string {
  const hex = typeof value === "bigint" ? value.toString(16) : value.toLowerCase().replace(/^0x/, "");
  return hex.padStart(64, "0");
}

export function readUint(result: string, index: number): bigint {
  return BigInt("0x" + result.replace(/^0x/, "").slice(index * 64, index * 64 + 64));
}

export function readAddress(result: string, index: number): string {
  return "0x" + result.replace(/^0x/, "").slice(index * 64 + 24, index * 64 + 64);
}
