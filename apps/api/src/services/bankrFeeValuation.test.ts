// Quote-side valuation of Bankr fee entries - cases taken from real Bankr
// data (2026-10-17): BNKR- and stock-quoted pools, a launched token itself
// named "BNKR", and labels that don't identify the quote side.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

let pools: Record<string, { currency0: string; currency1: string }> = {};
let prices: Record<string, number> = {};
mock.module("./indexerSync/envioClient", () => ({
  fetchWatchedPool: async (chain: string, poolId: string) => {
    const p = pools[`${chain}:${poolId}`];
    return p ? { id: poolId, chain, poolId, tokenAddress: null, tokenIsToken0: null, ...p } : null;
  },
}));
mock.module("./currentPrices", () => ({
  getCurrentPricesUsd: async (chain: string, addrs: string[]) =>
    new Map(addrs.filter((a) => `${chain}:${a}` in prices).map((a) => [a, prices[`${chain}:${a}`]])),
}));

const { quoteSide, learnQuoteAddresses, valueQuoteLegs, valueLaunchedClaimable } = await import("./bankrFeeValuation");

const BNKR = "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b";
const ETH_USD = 2000;
const e = (over: Record<string, unknown>) => ({
  tokenAddress: "0xlaunch", name: "X", symbol: "X", chain: "base" as const, poolId: "0xp", initializer: "", share: "",
  source: "doppler", token0Label: "WETH", token1Label: "X",
  claimable: { token0: "0", token1: "0" }, claimed: { token0: "0", token1: "0", count: 0 },
  ...over,
});

beforeEach(() => { pools = {}; prices = { [`base:${BNKR}`]: 0.0002 }; });

test("quote side: tokenIsToken0 when given, else the label that isn't the symbol", () => {
  expect(quoteSide(e({ tokenIsToken0: false, token0Label: "BNKR", token1Label: "X" }))).toBe(0);
  expect(quoteSide(e({ token0Label: "X", token1Label: "BNKR" }))).toBe(1);
  expect(quoteSide(e({ symbol: "SNDK", token0Label: "SNDK", token1Label: "SNDK" }))).toBeNull();
});

test("a launched token NAMED BNKR, quoted in WETH, counts its WETH side - not its own tokens", async () => {
  const [v] = await valueQuoteLegs(
    [e({ symbol: "BNKR", token0Label: "BNKR", token1Label: "WETH", claimable: { token0: "41551952", token1: "0.004794" } })],
    new Map(), ETH_USD,
  );
  expect(v.isWethQuote).toBe(true);
  expect(v.claimableEth).toBeCloseTo(0.004794, 10);
});

test("BNKR quote is priced in ETH; WETH at face value", async () => {
  const [bnkr, weth] = await valueQuoteLegs([
    e({ token0Label: "BNKR", claimed: { token0: "1000000", token1: "9", count: 1 } }),
    e({ claimable: { token0: "0.3", token1: "123" } }),
  ], new Map(), ETH_USD);
  expect(bnkr.claimedEth).toBeCloseTo(0.1, 10); // 1M * $0.0002 / $2000
  expect(weth.claimableEth).toBeCloseTo(0.3, 10);
});

test("labels learned from creator numeraires; a label seen with two addresses isn't trusted", () => {
  const learned = learnQuoteAddresses([
    e({ chain: "robinhood", token0Label: "GME", tokenIsToken0: false, numeraire: "0xGME1" }),
    e({ token0Label: "NVDA", tokenIsToken0: false, numeraire: "0xNVDA1" }),
    e({ token0Label: "NVDA", tokenIsToken0: false, numeraire: "0xNVDA2" }),
  ]);
  expect(learned.get("robinhood:GME")).toBe("0xgme1");
  expect(learned.has("base:NVDA")).toBe(false);
});

test("the pool record resolves an unknown quote label and settles ambiguous labels", async () => {
  pools["base:0xp1"] = { currency0: "0xSPY", currency1: "0xlaunch" };
  pools["base:0xp2"] = { currency0: "0xlaunch", currency1: "0xSNDKSTOCK" };
  prices["base:0xspy"] = 600;
  prices["base:0xsndkstock"] = 100;
  const [spy, sndk] = await valueQuoteLegs([
    e({ poolId: "0xp1", token0Label: "SPY", claimable: { token0: "1", token1: "5" } }),
    e({ poolId: "0xp2", symbol: "SNDK", token0Label: "SNDK", token1Label: "SNDK", claimable: { token0: "80000000", token1: "2" } }),
  ], new Map(), ETH_USD);
  expect(spy.claimableEth).toBeCloseTo(0.3, 10);
  expect(sndk.claimableEth).toBeCloseTo(0.1, 10); // side 1, from the pool - not the 80M launched tokens
});

test("unpriced quote: counts 0 and says so; an all-zero entry is fine", async () => {
  const [unknown, empty] = await valueQuoteLegs([
    e({ token0Label: "MYSTERY", claimable: { token0: "5", token1: "0" } }),
    e({ token0Label: "MYSTERY" }),
  ], new Map(), ETH_USD);
  expect(unknown).toMatchObject({ claimableEth: 0, priced: false });
  expect(empty.priced).toBe(true);
});

test("launched-side claimable: priced where possible, unpriced counted", async () => {
  prices["base:0xa"] = 0.02;
  const r = await valueLaunchedClaimable([
    e({ tokenAddress: "0xA", claimable: { token0: "0", token1: "100000" } }),
    e({ tokenAddress: "0xB", claimable: { token0: "0", token1: "5" } }),
    e({ tokenAddress: "0xC" }),
  ], ETH_USD);
  expect(r.eth[0]).toBeCloseTo(1, 10);
  expect(r.eth[1]).toBe(0);
  expect(r.unpriced).toBe(1);
});
