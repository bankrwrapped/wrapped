// Checks that the API's WRAPPED_WEBHOOK_SECRET matches the wrapped-ready
// webhook's, without anything reaching X.
//
// The body is deliberately NOT valid JSON. The webhook checks the signature
// first, then parses the body; only a parsed body with a handle produces a
// `prompt` (what makes the bot post). So:
//   correctly signed   -> 400 "invalid json"       (secret matches, nothing posted)
//   wrongly signed     -> 401 "invalid signature"  (control: proves the check is live)
// The secret is read from apps/api/.env and never printed.
//
// Usage (from apps/api): bun run scripts/diagnostics/webhook-secret.ts [path/to/.env]
// The .env defaults to ./.env. Verified 2026-10-17: MATCH.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const URL = "https://webhooks.bankr.bot/u/0xb4cbf18e7336ab99b7590564cd8d87f128de4ae7/wrapped-ready";
const envFile = process.argv[2] ?? ".env";

const line = readFileSync(envFile, "utf8").split(/\r?\n/).find((l) => l.startsWith("WRAPPED_WEBHOOK_SECRET="));
const secret = line?.slice("WRAPPED_WEBHOOK_SECRET=".length).trim().replace(/^["']|["']$/g, "");
if (!secret) throw new Error("WRAPPED_WEBHOOK_SECRET not found in " + envFile);

const body = "wrapped-ready secret check - not json"; // unparseable on purpose
const send = async (key: string) => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Wrapped-Signature": createHmac("sha256", key).update(body).digest("hex") },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, text: (await res.text()).slice(0, 200) };
};

const real = await send(secret);
const wrong = await send(secret + "-deliberately-wrong");
console.log(`real secret  -> HTTP ${real.status} ${real.text}`);
console.log(`wrong secret -> HTTP ${wrong.status} ${wrong.text}`);

if (real.text.includes("invalid json") && wrong.text.includes("invalid signature")) {
  console.log("\nMATCH: the API's secret is the one the webhook expects. Nothing was posted.");
} else if (real.text.includes("invalid signature")) {
  console.log("\nMISMATCH: the webhook rejected the real secret. Notifications would fail with 401.");
} else if (real.status === wrong.status && real.text === wrong.text) {
  console.log("\nINCONCLUSIVE: both requests got the same answer - the platform doesn't pass the handler's reply through.");
} else {
  console.log("\nUNEXPECTED: neither expected answer - check the webhook handler (webhooks/wrapped-ready).");
}
