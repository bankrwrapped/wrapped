// Frontend API URLs are same-origin by default (through the worker proxy),
// and the image-proxy helper still wraps external avatars exactly once.
import { test, expect } from "bun:test";
import { API_URL, X_LOGIN_URL, proxiedImageUrl } from "../src/lib/wrapped-data";

test("same-origin by default", () => {
  expect(API_URL).toBe("");
  expect(X_LOGIN_URL).toBe("/auth/x/login"); // the real route (header used to point at /api/auth/x/start)
});

test("external avatars are proxied once, never twice", () => {
  const avatar = "https://pbs.twimg.com/profile_images/1/a_400x400.jpg";
  const proxied = proxiedImageUrl(avatar);
  expect(proxied).toBe(`/api/image-proxy?url=${encodeURIComponent(avatar)}`);
  expect(proxiedImageUrl(proxied)).toBe(proxied);
});

// The profile carries what the reveal needs: totals, the "at least" flag,
// the real first launch, and trading volume in either stored form.
import { mapToProfile } from "../src/lib/wrapped-data";
import type { WrappedCacheRow } from "@bankr-wrapped/shared";

const row = (payload: Record<string, unknown>) =>
  ({
    walletAddress: "0xw",
    username: "alice",
    updatedAt: "",
    rank: 1,
    totalUsers: 2,
    percentile: 50,
    payload: {
      user: { handle: "alice", displayName: "alice", platform: "x", avatar: "", wallet: "0xw" },
      tokens: [],
      pleaseBroTokens: [],
      earnings: {
        creatorEarnings: 1,
        pleaseBroEarnings: 0,
        total: 1,
        creatorEarningsEth: 0.5,
        pleaseBroEarningsEth: 0.1,
        totalEth: 0.6,
      },
      claimable: { unclaimed: 0, unclaimedEth: 0 },
      bestDay: null,
      dailyEarnings: [],
      claimCount: 0,
      longestStreakDays: 0,
      summary: { tokensLaunched: 0, hasActivity: true },
      meta: {
        creatorFeesStatus: "ok",
        beneficiaryFeesStatus: "ok",
        earningsFromIndexerStatus: "ok",
      },
      tradingVolume: { totalVolumeUsd: 5, status: "ok", isComplete: false },
      earningsFromIndexer: 0,
      ...payload,
    },
  }) as unknown as WrappedCacheRow;

test("totals, partial flag and first launch come through", () => {
  const first = {
    tokenAddress: "0xold",
    name: "Old",
    symbol: "OLD",
    chain: "base",
    launchedAt: "2025-03-20T10:00:00.000Z",
  };
  const p = mapToProfile(
    row({
      summary: { tokensLaunched: 3, hasActivity: true, firstLaunch: first },
      meta: {
        creatorFeesStatus: "ok",
        beneficiaryFeesStatus: "ok",
        earningsFromIndexerStatus: "ok",
        earningsPartial: true,
      },
    }),
  );
  expect(p.totalEth).toBe(0.6);
  expect(p.earningsPartial).toBe(true);
  expect(p.firstLaunch).toEqual(first);
  expect(mapToProfile(row({})).firstLaunch).toBeNull();
  expect(mapToProfile(row({})).earningsPartial).toBe(false);
});

test("trading volume: object, legacy string, or not computed yet", () => {
  expect(mapToProfile(row({})).tradingVolume).toEqual({
    totalVolumeUsd: 5,
    status: "ok",
    isComplete: false,
  });
  expect(
    mapToProfile(
      row({ tradingVolume: JSON.stringify({ totalVolumeUsd: 9, status: "ok", isComplete: true }) }),
    ).tradingVolume,
  ).toEqual({ totalVolumeUsd: 9, status: "ok", isComplete: true });
  expect(
    mapToProfile(row({ tradingVolume: { status: "pending", totalVolumeUsd: 0 } })).tradingVolume
      .status,
  ).toBe("pending");
});
