// wrapped-ready webhook: rejects bad signatures, and the tweet links a page
// that exists (the site root - there is no per-handle route yet).
import { test, expect } from "bun:test";
import { createHmac } from "node:crypto";
import handler from "./index";

process.env.WRAPPED_WEBHOOK_SECRET = "s3cret";
const sign = (body: string) => createHmac("sha256", "s3cret").update(body).digest("hex");
const post = (body: string, signature: string | null) =>
  handler(new Request("https://webhooks.test/wrapped-ready", {
    method: "POST", body, headers: signature ? { "x-wrapped-signature": signature } : {},
  }));

test("valid signature -> tweet prompt linking the site root", async () => {
  const body = JSON.stringify({ handle: "@alice" });
  const res = await post(body, sign(body));
  expect(res.status).toBe(200);
  const { prompt } = await res.json();
  expect(prompt).toContain("@alice your Bankr Wrapped is ready");
  expect(prompt).toContain("bankrwrapped.com to see");
  expect(prompt).not.toContain("bankrwrapped.com/alice");
});

test("bad or missing signature -> 401", async () => {
  const body = JSON.stringify({ handle: "alice" });
  expect((await post(body, sign("tampered"))).status).toBe(401);
  expect((await post(body, null)).status).toBe(401);
});
