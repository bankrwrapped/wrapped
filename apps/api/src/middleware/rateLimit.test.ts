import { test, expect } from "bun:test";
import { createRateLimiter, checkAuthMeRouteLimit, checkSearchSuggestRouteLimit, checkWrappedRouteLimit } from "./rateLimit";

test("limits within a window", () => {
  const check = createRateLimiter(60_000, 2);
  expect(check("ip").allowed).toBe(true);
  expect(check("ip").allowed).toBe(true);
  const third = check("ip");
  expect(third.allowed).toBe(false);
  expect(third.retryAfterSeconds).toBeGreaterThan(0);
  expect(check("other-ip").allowed).toBe(true);
});

test("each limiter has its own buckets - search typing can't eat the wrapped budget", () => {
  const ip = "203.0.113.9";
  for (let i = 0; i < 60; i++) expect(checkSearchSuggestRouteLimit(ip).allowed).toBe(true);
  expect(checkSearchSuggestRouteLimit(ip).allowed).toBe(false);
  // Previously one shared per-IP bucket: these would already be 429.
  expect(checkWrappedRouteLimit(ip).allowed).toBe(true);
  expect(checkAuthMeRouteLimit(ip).allowed).toBe(true);
});
