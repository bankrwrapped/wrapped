// Claims on the cards: the full year from the indexer when the API sends
// it, else Bankr's 90 days; weekly bars past ~4 months; the calendar split in
// two halves past half a year.
import { test, expect } from "bun:test";
import { claimsView, claimWindowLabel } from "../src/lib/wrapped-data";
import { barHolds, chartBars } from "../src/lib/story-data";
import { calendarBlocks, claimRhythm } from "../src/lib/claim-rhythm";

const bankr = {
  dailyEarnings: [{ date: "2026-10-01", eth: 0.5 }],
  bestDay: { date: "2025-06-01", eth: 2 },
  longestStreakDays: 1,
};

test("claimsView prefers the indexer's year and falls back to Bankr's 90 days", () => {
  const fallback = claimsView(bankr);
  expect(fallback.windowDays).toBe(90);
  expect(fallback.days).toEqual(bankr.dailyEarnings);
  expect(fallback.bestDay).toEqual(bankr.bestDay);
  expect(claimWindowLabel(fallback)).toBe("90 days");

  const year = claimsView({
    ...bankr,
    claimHistory: {
      source: "indexer",
      from: "2025-11-05",
      to: "2026-11-04",
      days: [
        { date: "2026-01-10", eth: 3 },
        { date: "2026-01-11", eth: 1 },
      ],
      claimDays: 2,
      bestDay: { date: "2026-01-10", eth: 3 },
      longestStreakDays: 2,
      totalEth: 4,
      partial: false,
    },
  });
  expect(year.windowDays).toBe(365);
  expect(year.days.length).toBe(2);
  expect(year.bestDay).toEqual({ date: "2026-01-10", eth: 3 });
  expect(year.longestStreakDays).toBe(2);
  expect(claimWindowLabel(year)).toBe("the last year");
});

test("chartBars: daily up to ~4 months, weekly (Monday start) over a year", () => {
  const short = chartBars([
    { date: "2026-01-01", eth: 1 },
    { date: "2026-01-03", eth: 2 },
  ]);
  expect(short.map((b) => [b.date, b.eth])).toEqual([
    ["2026-01-01", 1],
    ["2026-01-02", 0],
    ["2026-01-03", 2],
  ]);

  // 2025-11-05 (a Wednesday) to 2026-11-04: weekly buckets
  const yearBars = chartBars([
    { date: "2025-11-05", eth: 1 },
    { date: "2025-11-09", eth: 2 }, // same week (Mon 2025-11-03)
    { date: "2026-03-18", eth: 5 },
    { date: "2026-11-04", eth: 1 },
  ]);
  expect(yearBars.length).toBeGreaterThan(50);
  expect(yearBars.length).toBeLessThan(55);
  expect(yearBars[0]).toEqual({ date: "2025-11-03", end: "2025-11-09", eth: 3 });
  const total = yearBars.reduce((s, b) => s + b.eth, 0);
  expect(total).toBe(9);
  const peak = yearBars.filter((b) => barHolds(b, "2026-03-18"));
  expect(peak.length).toBe(1);
  expect(peak[0].eth).toBe(5);
});

test("calendarBlocks keeps up to 27 weeks whole and halves a year", () => {
  const ninety = claimRhythm([
    { date: "2026-08-06", eth: 1 },
    { date: "2026-11-04", eth: 1 },
  ]);
  expect(calendarBlocks(ninety.weeks).length).toBe(1);

  const year = claimRhythm([
    { date: "2025-11-05", eth: 1 },
    { date: "2026-11-04", eth: 1 },
  ]);
  const blocks = calendarBlocks(year.weeks);
  expect(blocks.length).toBe(2);
  expect(blocks[0].length + blocks[1].length).toBe(year.weeks.length);
  expect(blocks[0].length).toBeLessThanOrEqual(27);
});
