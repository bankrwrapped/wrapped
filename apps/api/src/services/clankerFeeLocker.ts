import { env } from "../config/env";

// What a wallet can actually claim from Clanker right now, read on-chain.
//
// Bankr's fee API reports the same ~0.0677 WETH "claimable" on every Clanker
// token of every wallet checked (10 unrelated wallets, 2026-10-17), while
// ClankerFeeLocker.availableFees(wallet, WETH) returns 0-0.0006 for them -
// so Bankr's Clanker claimable can't be used. The locker pools fees per fee
// owner and fee token, not per launch, so this is one wallet-level number.

// Base v4.0.0 deployment - same address the indexer watches (apps/indexer/config.yaml).
const CLANKER_FEE_LOCKER = "0xF3622742b1E446D92e45E22923Ef11C2fcD55D68";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
// keccak256("availableFees(address,address)")[0:4]
const AVAILABLE_FEES_SELECTOR = "0x8296535a";
const TIMEOUT_MS = 10_000;

const word = (address: string) => address.toLowerCase().replace(/^0x/, "").padStart(64, "0");

export const CLANKER_FEE_TOKEN_WETH = BASE_WETH;

// availableFees(wallet, token) in the token's raw units, at `block` (a block
// number) or the latest block.
export async function getAvailableFees(wallet: string, token: string, block?: bigint): Promise<bigint> {
  const blockTag = block === undefined ? "latest" : "0x" + block.toString(16);
  const res = await fetch(env.BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: CLANKER_FEE_LOCKER, data: AVAILABLE_FEES_SELECTOR + word(wallet) + word(token) }, blockTag],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`availableFees RPC call failed: ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`availableFees RPC error: ${json.error.message}`);
  if (!json.result || json.result === "0x") throw new Error("availableFees returned no result");
  return BigInt(json.result);
}

export async function getClankerClaimableWeth(wallet: string): Promise<number> {
  return Number(await getAvailableFees(wallet, BASE_WETH)) / 1e18;
}
