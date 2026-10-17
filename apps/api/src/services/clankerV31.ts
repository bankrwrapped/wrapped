import type { WrappedTokenEntry } from "@bankr-wrapped/shared";
import { abiWord, baseEthCall, readAddress, readUint } from "./baseRpc";
import { getCurrentPricesUsd } from "./currentPrices";
import { getDecimals } from "./indexerSync/decimalsService";
import {
  cursorAfterBlock,
  cursorAfterEvent,
  fetchClankerV31ClaimsPage,
  fetchClankerV31Launches,
  PAGE_SIZE,
} from "./indexerSync/envioClient";
import { bankrTokenKey, priceRawAmount } from "./module8FeesBreakdown";
import { mapWithConcurrency } from "../utils/mapWithConcurrency";

// A wallet's Bankr launches on Clanker v3.1 (2025-03-18 to about July 2025)
// and the fees they earned it. Bankr's own API doesn't list these at all, so
// they come from the indexer (ClankerV31Launch, ClankerV31ClaimedRewards)
// and the chain.
//
// v3.1 has no fee locker: fees sit in the Uniswap V3 LP position until
// anyone calls LpLockerv2.collectRewards, which pays the creator their
// creatorReward% (40% on every Bankr launch sampled; Clanker takes 20%, the
// interface - Bankr - the rest). So earnings = collects already paid to the
// wallet (indexed) + the creator's share of what's still uncollected in each
// position (read on-chain by simulating the collect as the locker).

const CHAIN = "base" as const;
const LOCKER = "0x33e2Eda238edcF470309b8c6D228986A1204c8f9"; // LpLockerv2 (v3.1)
const POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1"; // Uniswap V3 NonfungiblePositionManager on Base
const WETH = "0x4200000000000000000000000000000000000006";
const SEL_TOKEN_REWARDS = "0x10eee734"; // tokenRewards(uint256)
const SEL_POSITIONS = "0x99fbab88"; // positions(uint256)
const SEL_COLLECT = "0xfc6f7865"; // collect((uint256,address,uint128,uint128))
const MAX_UINT128 = (1n << 128n) - 1n;
const RPC_CONCURRENCY = 4;

export interface ClankerV31Result {
  // The wallet's v3.1 launches as token entries (source "clanker_v3_1"),
  // each with its collected + uncollected creator fees.
  tokens: WrappedTokenEntry[];
  byToken: Record<string, number>;
  earnedEth: number;
  claimableEth: number;
  // Something couldn't be read or priced, so the figures are a floor.
  partial: boolean;
  // The earliest v3.1 launch. v3.1 predates every v4 and Doppler launch, so
  // when it exists this is the wallet's first Bankr launch we know of.
  firstLaunch: { tokenAddress: string; name: string; symbol: string; chain: "base"; launchedAt: string } | null;
}

const EMPTY: ClankerV31Result = { tokens: [], byToken: {}, earnedEth: 0, claimableEth: 0, partial: false, firstLaunch: null };

// Until the re-index that added v3.1, the indexer has no such entity and
// Hasura answers "field ... not found in type". That's "no v3.1 data yet",
// not a failure to flag on every wallet.
let warnedNotIndexed = false;
function isNotIndexedYet(err: unknown): boolean {
  return /not found in type/i.test(String(err));
}

// The creator's share of what's still uncollected in one position, raw, or
// null when the creator payout goes to another address (then it isn't this
// wallet's money).
async function uncollectedForCreator(wallet: string, positionId: bigint) {
  const rewards = await baseEthCall(LOCKER, SEL_TOKEN_REWARDS + abiWord(positionId));
  const creatorReward = readUint(rewards, 1);
  const recipient = readAddress(rewards, 3);
  if (recipient !== wallet.toLowerCase()) return null;

  const position = await baseEthCall(POSITION_MANAGER, SEL_POSITIONS + abiWord(positionId));
  const token0 = readAddress(position, 2);
  const token1 = readAddress(position, 3);
  const collected = await baseEthCall(
    POSITION_MANAGER,
    SEL_COLLECT + abiWord(positionId) + abiWord(LOCKER) + abiWord(MAX_UINT128) + abiWord(MAX_UINT128),
    { from: LOCKER },
  );
  return {
    token0,
    token1,
    raw0: (readUint(collected, 0) * creatorReward) / 100n,
    raw1: (readUint(collected, 1) * creatorReward) / 100n,
  };
}

async function priceNow(amounts: { token: string; raw: bigint }[], ethUsd: number) {
  const others = [...new Set(amounts.filter((a) => a.raw > 0n && a.token !== WETH).map((a) => a.token))];
  const prices = others.length > 0 && ethUsd > 0 ? await getCurrentPricesUsd(CHAIN, others) : new Map<string, number>();
  let eth = 0;
  let unpriced = 0;
  for (const { token, raw } of amounts) {
    if (raw === 0n) continue;
    if (token === WETH) {
      eth += Number(raw) / 1e18;
      continue;
    }
    const usd = prices.get(token);
    if (usd === undefined) {
      unpriced += 1;
      continue;
    }
    const decimals = await getDecimals(CHAIN, token);
    eth += ((Number(raw) / 10 ** decimals) * usd) / ethUsd;
  }
  return { eth, unpriced };
}

export async function getClankerV31(wallet: string, ethUsd: number): Promise<ClankerV31Result> {
  let launches;
  try {
    launches = await fetchClankerV31Launches(CHAIN, wallet);
  } catch (err) {
    if (isNotIndexedYet(err)) {
      if (!warnedNotIndexed) console.warn("[clankerV31] indexer has no v3.1 data yet (needs the re-index)");
      warnedNotIndexed = true;
      return EMPTY;
    }
    console.warn("[clankerV31] launches unavailable, err=" + String(err));
    return { ...EMPTY, partial: true };
  }

  let partial = false;
  const byToken: Record<string, number> = {};
  let earnedEth = 0;

  // Collects already paid to the wallet, valued when they happened. Includes
  // collects on launches it receives fees for but doesn't own.
  try {
    let cursor = cursorAfterBlock("0");
    for (;;) {
      const page = await fetchClankerV31ClaimsPage(CHAIN, wallet, cursor);
      for (const row of page) {
        let eth = 0;
        for (const [token, raw] of [[row.tokenAddress, row.amountToken0], [row.tokenAddress1, row.amountToken1]] as const) {
          if (!raw || BigInt(raw) === 0n) continue;
          try {
            eth += (await priceRawAmount(CHAIN, token, BigInt(raw), row.timestamp)).ethAmount;
          } catch {
            partial = true;
          }
        }
        const key = bankrTokenKey(CHAIN, row.launchedToken);
        byToken[key] = (byToken[key] ?? 0) + eth;
        earnedEth += eth;
      }
      if (page.length < PAGE_SIZE) break;
      cursor = cursorAfterEvent(page[page.length - 1]);
    }
  } catch (err) {
    console.warn("[clankerV31] collects unavailable, err=" + String(err));
    partial = true;
  }

  // Still uncollected, valued now.
  let claimableEth = 0;
  const uncollected = await mapWithConcurrency(launches, RPC_CONCURRENCY, async (l) => {
    try {
      const u = await uncollectedForCreator(wallet, BigInt(l.positionId));
      if (!u) return 0;
      const priced = await priceNow([{ token: u.token0, raw: u.raw0 }, { token: u.token1, raw: u.raw1 }], ethUsd);
      if (priced.unpriced > 0) partial = true;
      return priced.eth;
    } catch (err) {
      console.warn(`[clankerV31] uncollected read failed for position ${l.positionId}, err=` + String(err));
      partial = true;
      return 0;
    }
  });
  launches.forEach((l, i) => {
    const key = bankrTokenKey(CHAIN, l.tokenAddress);
    byToken[key] = (byToken[key] ?? 0) + uncollected[i];
    claimableEth += uncollected[i];
  });
  earnedEth += claimableEth;

  const tokens: WrappedTokenEntry[] = launches.map((l) => ({
    tokenAddress: l.tokenAddress,
    name: l.name,
    symbol: l.symbol,
    chain: CHAIN,
    feesEarnedEth: byToken[bankrTokenKey(CHAIN, l.tokenAddress)] ?? 0,
    source: "clanker_v3_1",
  }));
  const first = launches[0]; // ordered by block
  const firstLaunch = first
    ? { tokenAddress: first.tokenAddress, name: first.name, symbol: first.symbol, chain: CHAIN, launchedAt: new Date(first.timestamp).toISOString() }
    : null;
  return { tokens, byToken, earnedEth, claimableEth, partial, firstLaunch };
}
