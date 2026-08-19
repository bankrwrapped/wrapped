/**
 * wrapped-ready — Bankr webhook handler.
 *
 * This runs in an isolated Lambda when an external service POSTs to
 *   https://webhooks.bankr.bot/u/<wallet>/wrapped-ready
 *
 * Verification: @bankr/webhook-helpers is NOT a public npm package (confirmed —
 * 404 on registry.npmjs.org), only resolvable inside Bankr's deploy sandbox,
 * so its real signature can't be checked locally. Using a self-contained
 * node:crypto HMAC-SHA256 + timing-safe-compare verifier instead — same
 * security property, zero unverifiable dependency.
 *
 * Module 9 (our own backend) signs its POST body with WRAPPED_WEBHOOK_SECRET
 * and sends the hex digest in the X-Wrapped-Signature header. Set the secret
 * via: bankr webhooks env  (see its --help for exact syntax — unconfirmed
 * as of this file, set it to match whatever Module 9's sender uses).
 *
 * Contract: return Response.json({ prompt, threadId?, context? })
 */
import { createHmac, timingSafeEqual } from "node:crypto";

interface CompletionPayload {
  handle: string; // Bankr/X handle to tag, no leading @
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WRAPPED_WEBHOOK_SECRET;
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}

export default async function handler(req: Request): Promise<Response> {
  const rawBody = await req.text();

  const signature = req.headers.get("x-wrapped-signature");
  if (!verifySignature(rawBody, signature)) {
    // No `prompt` in the response = agent does not run.
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: CompletionPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.handle || payload.handle.trim().length === 0) {
    return Response.json({ error: "handle required" }, { status: 400 });
  }

  const handle = payload.handle.trim().replace(/^@/, "");

  // Fresh, standalone tweet — no threadId. Confirmed this session: threadId
  // is Bankr's own internal conversation memory, not an X thread/reply id,
  // and no documented mechanism lets an externally-triggered prompt reply
  // into a specific existing tweet.
  const prompt =
    `Post a tweet: "@${handle} your Bankr Wrapped is ready — ` +
    `see your trading recap at bankrwrapped.com/${handle}"`;

  return Response.json({ prompt });
}