import type { BeneficiaryFeeTokenEntry, Chain, CreatorFeeTokenEntry } from "@bankr-wrapped/shared";
import { getCurrentPricesUsd } from "./currentPrices";
import { fetchWatchedPool } from "./indexerSync/envioClient";

// Values Bankr's per-token fee amounts in ETH.
//
// Each entry has two sides (token0/token1, in the pool's address order -
// verified against tokenIsToken0 on 151 creator entries): the launched token
// and the quote asset it trades against. The quote asset is usually WETH,
// but many Doppler pools quote in BNKR or a tokenized stock (AAPL, GME,
// NVDA...). Reading only a "WETH" label counted those fees as 0 - for one
// wallet ~7.15 ETH of BNKR fees against 4.51 ETH counted. The quote side is
// now valued whatever it is: WETH at face value, anything else at its
// current USD price over ETH's.

export type FeeEntry = BeneficiaryFeeTokenEntry & Partial<Pick<CreatorFeeTokenEntry, "numeraire" | "tokenIsToken0">>;

const WETH: Record<Chain, string> = {
  base: "0x4200000000000000000000000000000000000006",
  robinhood: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
};

// Quote assets whose address is known, for entries that carry only a label
// (beneficiary-fees has no numeraire field). Addresses from Bankr's own
// creator-fees numeraire field.
const KNOWN_QUOTES: Record<Chain, Record<string, string>> = {
  base: { WETH: WETH.base, BNKR: "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b" },
  robinhood: { WETH: WETH.robinhood, BNKR: "0x178e54df3d091ee4d0b2534742ef9e3692b76526" },
};

export function parseAmount(raw: string | undefined | null): number {
  if (!raw) return 0;
  if (raw.trim().startsWith("<")) return 0;
  const cleaned = raw.replace(/^[^0-9.\-]+/, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// 0 or 1: which side is the quote asset. tokenIsToken0 when Bankr gives it;
// otherwise the side whose label isn't the launched token's symbol (true on
// every creator entry checked). null when that's ambiguous (e.g. SNDK/SNDK).
export function quoteSide(e: FeeEntry): 0 | 1 | null {
  if (typeof e.tokenIsToken0 === "boolean") return e.tokenIsToken0 ? 1 : 0;
  const is0 = e.token0Label === e.symbol;
  const is1 = e.token1Label === e.symbol;
  if (is0 !== is1) return is0 ? 1 : 0;
  if (e.token0Label === "WETH") return 0;
  if (e.token1Label === "WETH") return 1;
  return null;
}

const sideAmount = (pair: { token0: string; token1: string }, side: 0 | 1) => parseAmount(side === 0 ? pair.token0 : pair.token1);
const sideLabel = (e: FeeEntry, side: 0 | 1) => (side === 0 ? e.token0Label : e.token1Label);

// chain:label -> quote address, learned from creator entries' numeraire.
// A label seen with two different addresses is dropped: anyone can launch a
// token called "GME", so a label alone is only trusted when it's unambiguous.
export function learnQuoteAddresses(creatorTokens: FeeEntry[]): Map<string, string> {
  const seen = new Map<string, string | null>();
  for (const t of creatorTokens) {
    const side = quoteSide(t);
    if (side === null || !t.numeraire) continue;
    const key = `${t.chain}:${sideLabel(t, side)}`;
    const addr = t.numeraire.toLowerCase();
    const prev = seen.get(key);
    seen.set(key, prev === undefined || prev === addr ? addr : null);
  }
  const out = new Map<string, string>();
  for (const [k, v] of seen) if (v) out.set(k, v);
  return out;
}

interface ResolvedQuote {
  side: 0 | 1 | null;
  address: string | null;
}

// Quote side and address per entry: numeraire, then known quotes, then
// labels learned from this wallet's creator entries, then the indexer's pool
// record - whose quote currency is whichever isn't the launched token, which
// also settles entries whose labels are ambiguous (e.g. SNDK/SNDK).
async function resolveQuotes(entries: FeeEntry[], learned: Map<string, string>): Promise<ResolvedQuote[]> {
  return Promise.all(
    entries.map(async (e): Promise<ResolvedQuote> => {
      const side = quoteSide(e);
      if (side !== null) {
        if (e.numeraire) return { side, address: e.numeraire.toLowerCase() };
        const label = sideLabel(e, side);
        const known = KNOWN_QUOTES[e.chain]?.[label] ?? learned.get(`${e.chain}:${label}`);
        if (known) return { side, address: known };
      }
      if (!e.poolId) return { side, address: null };
      try {
        const pool = await fetchWatchedPool(e.chain, e.poolId);
        if (!pool) return { side, address: null };
        const launched = e.tokenAddress.toLowerCase();
        const c0 = pool.currency0.toLowerCase();
        const c1 = pool.currency1.toLowerCase();
        if (c0 === launched) return { side: 1, address: c1 };
        if (c1 === launched) return { side: 0, address: c0 };
        return { side, address: side === null ? null : side === 0 ? c0 : c1 };
      } catch {
        return { side, address: null };
      }
    }),
  );
}

async function pricesFor(wanted: { chain: Chain; address: string }[]): Promise<Map<string, number>> {
  const byChain = new Map<Chain, string[]>();
  for (const w of wanted) byChain.set(w.chain, [...(byChain.get(w.chain) ?? []), w.address]);
  const out = new Map<string, number>();
  await Promise.all(
    [...byChain].map(async ([chain, addrs]) => {
      for (const [addr, usd] of await getCurrentPricesUsd(chain, addrs)) out.set(`${chain}:${addr}`, usd);
    }),
  );
  return out;
}

export interface QuoteLegValue {
  claimedEth: number;
  claimableEth: number;
  isWethQuote: boolean;
  // false when the quote side had a nonzero amount that couldn't be priced
  // (counted as 0).
  priced: boolean;
}

export async function valueQuoteLegs(
  entries: FeeEntry[],
  learned: Map<string, string>,
  ethUsd: number,
): Promise<QuoteLegValue[]> {
  const resolved = await resolveQuotes(entries, learned);
  const isWeth = (e: FeeEntry, { side, address }: ResolvedQuote) =>
    address ? address === WETH[e.chain] : side !== null && sideLabel(e, side) === "WETH";

  const wanted = entries
    .map((e, i) => ({ chain: e.chain, address: resolved[i].address, weth: isWeth(e, resolved[i]) }))
    .filter((w): w is { chain: Chain; address: string; weth: boolean } => w.address !== null && !w.weth);
  const prices = ethUsd > 0 ? await pricesFor(wanted) : new Map<string, number>();

  return entries.map((e, i) => {
    const { side, address: addr } = resolved[i];
    if (side === null) {
      const hasAmount = parseAmount(e.claimed.token0) + parseAmount(e.claimed.token1) +
        parseAmount(e.claimable.token0) + parseAmount(e.claimable.token1) > 0;
      return { claimedEth: 0, claimableEth: 0, isWethQuote: false, priced: !hasAmount };
    }
    const claimed = sideAmount(e.claimed, side);
    const claimable = sideAmount(e.claimable, side);
    if (isWeth(e, resolved[i])) return { claimedEth: claimed, claimableEth: claimable, isWethQuote: true, priced: true };
    const usd = addr ? prices.get(`${e.chain}:${addr}`) : undefined;
    if (usd === undefined) return { claimedEth: 0, claimableEth: 0, isWethQuote: false, priced: claimed + claimable === 0 };
    return { claimedEth: (claimed * usd) / ethUsd, claimableEth: (claimable * usd) / ethUsd, isWethQuote: false, priced: true };
  });
}

// The launched-token side of each entry's claimable fees, in ETH. Used by
// the indexer total, which counts both sides of a payout (Doppler Release),
// so its unclaimed part has to count both sides too.
export async function valueLaunchedClaimable(
  entries: FeeEntry[],
  ethUsd: number,
): Promise<{ eth: number[]; unpriced: number }> {
  const amounts = entries.map((e) => {
    const q = quoteSide(e);
    return q === null ? 0 : sideAmount(e.claimable, q === 0 ? 1 : 0);
  });
  const wanted = entries
    .map((e, i) => ({ chain: e.chain, address: e.tokenAddress.toLowerCase(), amount: amounts[i] }))
    .filter((w) => w.amount > 0);
  const prices = ethUsd > 0 ? await pricesFor(wanted) : new Map<string, number>();
  let unpriced = 0;
  const eth = entries.map((e, i) => {
    if (amounts[i] === 0) return 0;
    const usd = prices.get(`${e.chain}:${e.tokenAddress.toLowerCase()}`);
    if (usd === undefined) {
      unpriced += 1;
      return 0;
    }
    return (amounts[i] * usd) / ethUsd;
  });
  return { eth, unpriced };
}
