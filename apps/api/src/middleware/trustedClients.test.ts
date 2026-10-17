// Trusted clients get their own rate-limit bucket - only with an exact,
// configured key of sane length.
import "../test/setupEnv";
import { test, expect, afterEach } from "bun:test";
import { trustedClientId, TRUSTED_CLIENT_HEADER } from "./trustedClients";

const req = (key?: string) => new Request("http://x/api/wrapped/a", { headers: key ? { [TRUSTED_CLIENT_HEADER]: key } : {} });
const K1 = "k".repeat(32);
const K2 = "z".repeat(40);

afterEach(() => { delete process.env.WRAPPED_TRUSTED_CLIENT_KEYS; });

test("unset -> nobody is trusted", () => {
  expect(trustedClientId(req(K1))).toBeNull();
});

test("an exact configured key is trusted, with a non-secret id", () => {
  process.env.WRAPPED_TRUSTED_CLIENT_KEYS = ` ${K1} , ${K2}`;
  expect(trustedClientId(req(K1))).toBe("client-1");
  expect(trustedClientId(req(K2))).toBe("client-2");
  expect(trustedClientId(req(K1.slice(1)))).toBeNull();
  expect(trustedClientId(req())).toBeNull();
});

test("keys shorter than 16 characters are ignored", () => {
  process.env.WRAPPED_TRUSTED_CLIENT_KEYS = "short";
  expect(trustedClientId(req("short"))).toBeNull();
});
