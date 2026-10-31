// Pure helpers behind the Wrapped cards and leaderboards: Builder Type tiers
// (must match the bot skill), launch themes, the claim calendar, and score
// formatting per board unit.
import { test, expect } from "bun:test";
import { getBuilderType } from "../src/lib/builder-type";
import { summarizeThemes, themeOf } from "../src/lib/token-themes";
import { claimRhythm } from "../src/lib/claim-rhythm";
import { formatBoardScore } from "../src/lib/wrapped-data";

test("Builder Type tier edges follow the skill's table", () => {
  expect(getBuilderType(0)).toBeNull();
  expect(getBuilderType(1)?.title).toBe("The Launch Pioneer");
  expect(getBuilderType(5)?.title).toBe("The Repeat Offender");
  expect(getBuilderType(6)?.title).toBe("The Trench Regular");
  expect(getBuilderType(20)?.title).toBe("The Deploy Machine");
  expect(getBuilderType(35)?.title).toBe("The Launch Warlord");
  expect(getBuilderType(50)?.title).toBe("The Mint Kingpin");
  expect(getBuilderType(51)?.title).toBe("The Final Boss");
});

const token = (name: string, symbol: string, feesEarnedEth = 0) => ({
  tokenAddress: "0x" + symbol,
  name,
  symbol,
  chain: "base" as const,
  feesEarnedEth,
  source: "doppler",
});

test("themes match whole words only, and unknowns fall through to other", () => {
  expect(themeOf(token("Agent Smith", "SMITH"))).toBe("ai");
  expect(themeOf(token("Based Dog", "BDOG"))).toBe("animals");
  expect(themeOf(token("Tesla Stock", "TSLA"))).toBe("stocks");
  // "thai" contains "ai" but isn't the word "ai"; "category" contains "cat".
  expect(themeOf(token("Thai Food", "THAI"))).toBe("other");
  expect(themeOf(token("Category", "CTGY"))).toBe("other");
});

test("theme summary ranks by fees, then launch count", () => {
  const s = summarizeThemes([
    token("Dog One", "D1", 0.1),
    token("Dog Two", "D2", 0.1),
    token("Agent", "AG", 1),
    token("Mystery", "MYS", 0),
  ]);
  expect(s.map((t) => [t.id, t.count])).toEqual([
    ["ai", 1],
    ["animals", 2],
    ["other", 1],
  ]);
});

test("claim calendar pads to Monday-start weeks and finds the busiest weekday", () => {
  // 2026-10-05 is a Monday.
  const r = claimRhythm([
    { date: "2026-10-07", eth: 0.5 }, // Wed
    { date: "2026-10-14", eth: 0.1 }, // Wed
    { date: "2026-10-16", eth: 0 }, // Fri, no claim
    { date: "2026-10-18", eth: 0.2 }, // Sun
  ]);
  expect(r.claimDays).toBe(3);
  expect(r.busiestWeekday).toBe("Wed");
  expect(r.weeks).toHaveLength(2);
  expect(r.weeks[0].slice(0, 2)).toEqual([null, null]);
  expect(r.weeks[0][2]).toEqual({ date: "2026-10-07", eth: 0.5 });
  expect(r.weeks[0][3]).toEqual({ date: "2026-10-08", eth: 0 });
  expect(r.weeks[1][6]).toEqual({ date: "2026-10-18", eth: 0.2 });
  expect(claimRhythm([]).busiestWeekday).toBeNull();
});

test("board scores format by unit", () => {
  expect(formatBoardScore(1.23456, "eth")).toBe("1.235 ETH");
  expect(formatBoardScore(1, "days")).toBe("1 day");
  expect(formatBoardScore(12, "days")).toBe("12 days");
  expect(formatBoardScore(0.4, "percent")).toBe("40%");
  expect(formatBoardScore(2.66, "multiple")).toBe("2.7×");
});
