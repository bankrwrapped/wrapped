// Boots the real API entry (src/index.ts) in a child process and checks
// route wiring: the removed X sign-in routes 404, the image proxy refuses
// non-allowlisted hosts. No DB is needed for these paths.
import "./test/setupEnv";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";

const PORT = 40000 + Math.floor(Math.random() * 10000);
const BASE = `http://localhost:${PORT}`;
let proc: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  proc = Bun.spawn(["bun", "--no-env-file", join(import.meta.dir, "index.ts")], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test" },
    // The boot-time sweeps log Postgres connection errors here (no DB in this
    // test) - expected noise.
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("API did not start");
}, 20_000); // cold `bun` start + transpile can exceed the 5s default
afterAll(() => proc?.kill());

test("health", async () => {
  expect(await (await fetch(`${BASE}/health`)).json()).toEqual({ status: "ok" });
});

test("X sign-in is gone: its routes 404 (Wrapped is a public lookup)", async () => {
  for (const path of ["/api/auth/me", "/auth/x/login", "/auth/x/callback"]) {
    expect((await fetch(`${BASE}${path}`)).status).toBe(404);
  }
});

test("image proxy refuses non-allowlisted hosts", async () => {
  const res = await fetch(`${BASE}/api/image-proxy?url=${encodeURIComponent("https://evil.example/x.png")}`);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "host not allowed" });
});
