// First-party API proxy in the frontend worker (src/server.ts): /api/* is
// forwarded to the API with the real visitor's IP and protocol.
import { test, expect, beforeAll, afterAll } from "bun:test";
import worker from "../src/server";

let upstream: ReturnType<typeof Bun.serve>;
let env: { API_ORIGIN: string };

beforeAll(() => {
  upstream = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      return Response.json({
        path: url.pathname + url.search,
        method: req.method,
        body: req.method === "POST" ? await req.text() : null,
        cookie: req.headers.get("cookie"),
        xff: req.headers.get("x-forwarded-for"),
        proto: req.headers.get("x-forwarded-proto"),
        forwardedHost: req.headers.get("x-forwarded-host"),
      });
    },
  });
  env = { API_ORIGIN: `http://localhost:${upstream.port}` };
});
afterAll(() => upstream.stop());

test("/api/* forwards path, query, cookie, real client IP and https", async () => {
  const res = await worker.fetch(
    new Request("https://bankrwrapped.com/api/wrapped/demo?x=1", {
      headers: { cookie: "session=abc", "cf-connecting-ip": "203.0.113.7" },
    }),
    env,
    {},
  );
  expect(await res.json()).toEqual({
    path: "/api/wrapped/demo?x=1", method: "GET", body: null, cookie: "session=abc",
    xff: "203.0.113.7", proto: "https", forwardedHost: "bankrwrapped.com",
  });
});

test("request bodies are forwarded", async () => {
  const res = await worker.fetch(
    new Request("https://bankrwrapped.com/api/echo", { method: "POST", body: "hello" }),
    env,
    {},
  );
  expect(await res.json()).toMatchObject({ method: "POST", body: "hello" });
});

test("API down -> clean 502, not a crash", async () => {
  const res = await worker.fetch(new Request("https://bankrwrapped.com/api/leaderboard"), { API_ORIGIN: "http://localhost:1" }, {});
  expect(res.status).toBe(502);
  expect((await res.json()).error).toContain("Couldn't reach");
});
