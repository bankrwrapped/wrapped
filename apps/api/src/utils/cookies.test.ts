import { test, expect } from "bun:test";
import { parseCookies, serializeCookie } from "./cookies";

test("a malformed %-escape in one cookie doesn't throw or drop the others", () => {
  expect(parseCookies("bad=%E0%A4%A; session=abc; other=a%20b")).toEqual({ session: "abc", other: "a b" });
});

test("serialize round-trips through parse", () => {
  const value = JSON.stringify({ state: "s", verifier: "v" });
  const header = serializeCookie("x_oauth_pkce", value, { httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  const pair = header.split(";")[0];
  expect(parseCookies(pair)).toEqual({ x_oauth_pkce: value });
  expect(header).toContain("HttpOnly");
  expect(header).toContain("Secure");
  expect(header).toContain("SameSite=Lax");
});
