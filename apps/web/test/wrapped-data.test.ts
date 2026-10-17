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
