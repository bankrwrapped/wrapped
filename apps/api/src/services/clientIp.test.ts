import { test, expect } from "bun:test";
import { getClientIp } from "./clientIp";

const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

test("X-Real-IP (written by the proxy) wins", () => {
  expect(getClientIp(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 9.9.9.9" }), "10.0.0.1")).toBe("9.9.9.9");
});

test("a client-chosen first X-Forwarded-For entry can't pick the bucket", () => {
  expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }), "10.0.0.1")).toBe("5.5.5.5");
  expect(getClientIp(req({ "x-forwarded-for": "7.7.7.7, 5.5.5.5" }), "10.0.0.1")).toBe("5.5.5.5");
});

test("no proxy headers: the socket address", () => {
  expect(getClientIp(req({}), "127.0.0.1")).toBe("127.0.0.1");
  expect(getClientIp(req({}), undefined)).toBe("unknown");
});
