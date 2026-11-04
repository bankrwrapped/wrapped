// Builds demo/fixtures.json: a sample launcher's Wrapped payload and every
// leaderboard response the demo can ask for, ranked by the API's own
// rankBoard so the boards behave exactly like production. All people and
// tokens are invented. Run from apps/api: bun --no-env-file ../web/demo/make-fixtures.ts
import "../../api/src/test/setupEnv";
import { BOARDS } from "@bankr-wrapped/shared";
import { rankBoard, resolveEdition } from "../../api/src/services/leaderboards";
import type { BoardMetrics } from "../../api/src/repositories/wrappedCacheRepository";

const NOW = new Date(process.env.DEMO_NOW ?? Date.now());
const today = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// Deterministic pseudo-random, so rebuilding gives the same demo.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function avatar(name: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,35%)"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="124" font-family="Arial,sans-serif" font-size="72" font-weight="700" fill="#fff" text-anchor="middle">${name.slice(0, 2).toUpperCase()}</text></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

const addr = (s: string) => "0x" + Buffer.from(s).toString("hex").padEnd(40, "0").slice(0, 40);

// ---- the demo user ----
const HANDLE = "demobuilder";
const tokens: Array<[string, string, number]> = [
  ["Agent Mira", "MIRA", 3.184],
  ["Night Shift Bot", "NSB", 1.226],
  ["Ledger Cat", "LCAT", 0.742],
  ["Based Frog", "BFROG", 0.388],
  ["Neural Garden", "NGRDN", 0.214],
  ["GM Machine", "GMM", 0.131],
  ["Copper Fund", "COPR", 0.097],
  ["Moon Hamster", "MHAM", 0.064],
  ["Tiny Agent", "TINY", 0.041],
  ["Saturday Swap", "SSWP", 0.018],
  ["Paper Hands Club", "PHC", 0.009],
  ["Last Light", "LAST", 0.004],
  ["Quiet Protocol", "QUIET", 0.002],
  ["Cloud Duck", "CDUCK", 0],
];
const launched = tokens.map(([name, symbol, fees]) => ({
  tokenAddress: addr(symbol), name, symbol, chain: "base", feesEarnedEth: fees, source: "doppler",
}));
const pleaseBro = [
  ["Friendly Fire", "FRND", 0.512],
  ["Signal Dog", "SDOG", 0.097],
  ["Orbit Labs", "ORBT", 0.021],
].map(([name, symbol, fees]) => ({
  tokenAddress: addr(symbol as string), name, symbol, chain: "base", feesEarnedEth: fees, source: "clanker",
}));

// 90 days of claims ending today: mostly Tuesdays and Thursdays, a 9-day run in
// late September, and one big day.
const dailyEarnings: Array<{ date: string; eth: number }> = [];
for (let i = 89; i >= 0; i--) {
  const t = today - i * DAY;
  const wd = new Date(t).getUTCDay();
  const inRun = i >= 33 && i <= 41;
  const claims = inRun || ((wd === 2 || wd === 4) && rand() < 0.85) || rand() < 0.12;
  if (!claims) continue;
  dailyEarnings.push({ date: iso(t), eth: Math.round((0.012 + rand() * 0.09) * 10000) / 10000 });
}
// A claim today, so the new month's board has the demo user on it.
if (dailyEarnings.at(-1)?.date !== iso(today)) dailyEarnings.push({ date: iso(today), eth: 0.0642 });
const big = dailyEarnings[Math.floor(dailyEarnings.length / 2)];
big.eth = 0.8731;

// The indexer's year of claims (payload.claimHistory): the 90 days above plus
// the 275 before them, sparser (Mondays and Fridays), with the year's best day
// in March. Its own generator, so the boards below stay the same.
let yearSeed = 7;
const yearRand = () => ((yearSeed = (yearSeed * 16807) % 2147483647) - 1) / 2147483646;
const earlier: Array<{ date: string; eth: number }> = [];
for (let i = 364; i >= 90; i--) {
  const t = today - i * DAY;
  const wd = new Date(t).getUTCDay();
  if (!(((wd === 1 || wd === 5) && yearRand() < 0.7) || yearRand() < 0.06)) continue;
  earlier.push({ date: iso(t), eth: Math.round((0.01 + yearRand() * 0.12) * 10000) / 10000 });
}
const yearPeak = earlier[Math.floor(earlier.length * 0.4)];
yearPeak.eth = 1.4216;
const yearDays = [...earlier, ...dailyEarnings];
const runOf = (dates: string[]) => {
  let best = 0, run = 0, prev = 0;
  for (const d of dates) {
    const t = Date.parse(d + "T00:00:00Z");
    run = t - prev === DAY ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
};
const claimHistory = {
  source: "indexer",
  from: iso(today - 364 * DAY),
  to: iso(today),
  days: yearDays,
  claimDays: yearDays.length,
  bestDay: { date: yearPeak.date, eth: yearPeak.eth },
  longestStreakDays: runOf(yearDays.map((d) => d.date)),
  totalEth: Math.round(yearDays.reduce((a, d) => a + d.eth, 0) * 10000) / 10000,
  partial: false,
};

const creatorEarningsEth = 6.482;
const pleaseBroEarningsEth = 0.630;
const ETH_USD = 3400;
const payload = {
  user: { handle: HANDLE, displayName: "Demo Builder", platform: "x", avatar: avatar("Demo Builder", 268), wallet: addr("demo-wallet") },
  tokens: launched,
  pleaseBroTokens: pleaseBro,
  earnings: {
    creatorEarnings: creatorEarningsEth * ETH_USD,
    pleaseBroEarnings: pleaseBroEarningsEth * ETH_USD,
    total: (creatorEarningsEth + pleaseBroEarningsEth) * ETH_USD,
    creatorEarningsEth,
    pleaseBroEarningsEth,
    totalEth: creatorEarningsEth + pleaseBroEarningsEth,
  },
  claimable: { unclaimed: 0.415 * ETH_USD, unclaimedEth: 0.415 },
  bestDay: { date: big.date, eth: big.eth },
  dailyEarnings,
  claimCount: dailyEarnings.length + 6,
  longestStreakDays: 9,
  claimHistory,
  summary: {
    tokensLaunched: launched.length,
    hasActivity: true,
    firstLaunch: { tokenAddress: launched[0].tokenAddress, name: "Agent Mira", symbol: "MIRA", chain: "base", launchedAt: "2025-04-12T16:20:00.000Z" },
  },
  meta: { creatorFeesStatus: "ok", beneficiaryFeesStatus: "ok", earningsFromIndexerStatus: "ok", earningsSource: "bankr", earningsPartial: false },
  tradingVolume: {
    totalVolumeUsd: 4_812_400, status: "ok", isComplete: true, tokensTotal: 14, tokensComplete: 14,
    tokensInProgress: 0, tokensPending: 0, tokensFailed: 0, updatedAt: new Date(today).toISOString(),
  },
  earningsFromIndexer: 0,
};

// ---- everyone else on the boards ----
const names = [
  "Rowan Vale", "Kit Marlow", "Juno Park", "Ezra Quill", "Sable Okafor", "Milo Brandt", "Wren Hale",
  "Theo Cask", "Nova Reyes", "Iris Lund", "Jasper Moss", "Lena Frost", "Otis Crane", "Pia Novak",
  "Remy Stone", "Cass Ward", "Dax Ellery", "Fern Ito", "Gus Halloran", "Hana Sato", "Ivo Petrov",
  "Juna Blake", "Kai Mercer", "Lux Adeyemi", "Mara Quinn",
];
const people: BoardMetrics[] = names.map((n, i) => {
  const launches = 1 + Math.floor(rand() * 40);
  const fees = Array.from({ length: launches }, (_, k) => Math.round((k === 0 ? 0.2 + rand() * 6 : rand() * rand() * 0.6) * 1000) / 1000);
  const creatorEth = fees.reduce((a, b) => a + b, 0) * (1 + rand());
  return {
    walletAddress: addr("w" + i),
    username: n.toLowerCase().replace(/[^a-z]/g, ""),
    displayName: n,
    avatarUrl: avatar(n, (i * 47) % 360),
    totalEth: Math.round((creatorEth + rand() * 1.5) * 1000) / 1000,
    creatorEth,
    tokensLaunched: launches,
    pleaseBroCount: Math.floor(rand() * 7),
    firstIndexedAt: new Date(today - Math.floor(rand() * 60) * DAY).toISOString(),
    bestDayEth: Math.round(rand() * 1.4 * 1000) / 1000,
    streakDays: Math.floor(rand() * 14),
    monthEth: 0,
    tokenFees: fees,
  };
});
const demoMetrics: BoardMetrics = {
  walletAddress: payload.user.wallet,
  username: HANDLE,
  displayName: "Demo Builder",
  avatarUrl: payload.user.avatar,
  totalEth: payload.earnings.totalEth,
  creatorEth: creatorEarningsEth,
  tokensLaunched: launched.length,
  pleaseBroCount: pleaseBro.length,
  firstIndexedAt: new Date(today - 70 * DAY).toISOString(),
  bestDayEth: big.eth,
  streakDays: 9,
  monthEth: 0,
  tokenFees: launched.map((t) => t.feesEarnedEth),
};

function monthEthFor(m: BoardMetrics, from: string, to: string, i: number): number {
  if (m.username === HANDLE) return dailyEarnings.filter((d) => d.date >= from && d.date < to).reduce((a, d) => a + d.eth, 0);
  // Others: a share of their best day, scaled by how much of the month has passed.
  const days = Math.max(1, Math.min(30, (Math.min(Date.parse(to), today + DAY) - Date.parse(from)) / DAY));
  return i % 4 === 3 ? 0 : Math.round(m.bestDayEth * (0.15 + ((i * 7) % 10) / 12) * (days / 30) * 1000) / 1000;
}

const leaderboards: Record<string, unknown> = {};
for (const monthParam of [null, resolveEdition("x", NOW).month, (() => { const d = new Date(NOW); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })()]) {
  const { from, to, ...edition } = resolveEdition(monthParam, NOW);
  const all = [...people, demoMetrics].map((m, i) => ({ ...m, monthEth: monthEthFor(m, from, to, i) }));
  const monthPool = all.filter((m) => m.firstIndexedAt < edition.closesAt);
  for (const handle of [null, HANDLE]) {
    leaderboards[`${edition.month}|${handle ?? ""}`] = {
      edition,
      boards: BOARDS.map((b) => rankBoard(b.id, b.id === "month" ? monthPool : all, { limit: 10, me: handle })),
    };
  }
}
const current = resolveEdition(null, NOW).month;

// GET /api/leaderboard (landing teaser + command stream): top 20 by earnings.
const topEarners = [...people, demoMetrics]
  .sort((a, b) => b.totalEth - a.totalEth)
  .slice(0, 20)
  .map((m) => ({
    walletAddress: m.walletAddress, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl,
    tokensLaunched: m.tokensLaunched, pleaseBroCount: m.pleaseBroCount,
    totalEarningsUsd: m.totalEth * ETH_USD, unclaimedUsd: 0, totalEarningsEth: m.totalEth, unclaimedEth: 0,
    updatedAt: new Date(today).toISOString(),
  }));

const rank = [...people, demoMetrics].sort((a, b) => b.totalEth - a.totalEth).findIndex((m) => m.username === HANDLE) + 1;
const total = people.length + 1;
await Bun.write(
  new URL("./fixtures.json", import.meta.url),
  JSON.stringify({
    handle: HANDLE,
    currentMonth: current,
    wrapped: { walletAddress: payload.user.wallet, username: HANDLE, payload, updatedAt: new Date(today).toISOString(), rank, totalUsers: total, percentile: Math.round((rank / total) * 100) },
    leaderboards,
    topEarners,
  })
);
console.log(`fixtures: ${HANDLE} rank ${rank}/${total}, editions ${Object.keys(leaderboards).join(", ")}`);
