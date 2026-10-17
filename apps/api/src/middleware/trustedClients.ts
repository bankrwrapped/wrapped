import { timingSafeEqual } from "node:crypto";

// The Bankr bot calls /api/wrapped on behalf of every skill user, from a few
// server IPs - so the public per-IP limit (20/min) is shared by all of them.
// A caller that sends a known key in X-Wrapped-Client-Key gets its own, much
// larger bucket instead. Keys come from WRAPPED_TRUSTED_CLIENT_KEYS
// (comma-separated); unset means no trusted clients.
//
// Key-only on purpose: the client IP comes from X-Forwarded-For, which a
// caller can set, so an IP allowlist could be spoofed into the bigger bucket.

export const TRUSTED_CLIENT_HEADER = "x-wrapped-client-key";

function configuredKeys(): string[] {
  return (process.env.WRAPPED_TRUSTED_CLIENT_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 16); // a short key is a misconfiguration, not a secret
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// A stable, non-secret id for the matching key ("client-1", ...) to use as
// the rate-limit bucket and in logs; null when the request isn't trusted.
export function trustedClientId(req: Request): string | null {
  const presented = req.headers.get(TRUSTED_CLIENT_HEADER);
  if (!presented) return null;
  const keys = configuredKeys();
  for (let i = 0; i < keys.length; i++) {
    if (safeEqual(presented, keys[i])) return `client-${i + 1}`;
  }
  return null;
}
