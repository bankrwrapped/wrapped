import { getLeaderboardController, getWrappedController } from "./controllers/wrappedController";
import { startXLogin, handleXCallback, getMe } from "./controllers/authController";
import { checkSearchSuggestRouteLimit, checkWrappedRouteLimit } from "./middleware/rateLimit";
import { wrappedService } from "./services/wrappedService";
import { startBackfillSweep } from "./services/indexerSync/backfillSweep";
import { startRefreshSweep } from "./services/indexerSync/refreshSweep";


const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Module 14: was a wildcard origin, which is incompatible with credentialed
// (cookie-based) requests - browsers reject `Access-Control-Allow-Origin: *`
// when the request carries credentials. Explicit allowlist, origin reflected
// back only when it matches, so cookies from the X OAuth session can flow.
const ALLOWED_ORIGINS = new Set([
  "https://bankrwrapped.com",
  "http://localhost:8081", // apps/web (Vite/TanStack Start) dev server - actual observed port, not Vite's default
]);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function withCors(res: Response, req: Request): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeadersFor(req))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests, slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

// Railway sits in front of this app behind its own edge proxy, so
// server.requestIP() returns RAILWAY'S internal address for every request,
// not the visitor's - previously this silently collapsed every real user
// into one shared rate-limit bucket, meaning one active visitor could get
// everyone else 429'd. Railway forwards the real client via X-Forwarded-For
// (first entry in the comma-separated chain is the original client).
// Falls back to the raw socket IP only when the header is absent (local
// dev with no proxy in front) - Railway always sets this header in
// production, so this fallback never fires there.
function getClientIp(req: Request, server: Bun.Server<undefined>): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return server.requestIP(req)?.address ?? "unknown";
}

Bun.serve({
  port: PORT,
  // Default is 10s, which is too tight for a cold request doing 3 parallel
  // outbound fetches plus a DB write. Raised 30 -> 45 on 2026-08-18: found
  // live that fetchEarningsFromIndexer's own FETCH_TIMEOUT_MS (25s) stacks
  // on top of resolveWallet's outbound call (observed 2.3-6.4s) plus
  // upsert/attachRank overhead, landing at ~27.5-31s+ total - right on top
  // of the old 30s ceiling. Bun kills the socket silently at idleTimeout
  // with zero bytes sent if the handler is still running past it, which is
  // indistinguishable from a hang to the client (curl: (52) Empty reply) -
  // this was happening even though every downstream call completed
  // successfully with no thrown error. 45s gives real headroom above the
  // current worst-case inner timeout chain. Real fix is still to stop
  // stacking a near-30s inner timeout onto a single request's budget at
  // all (see wrappedService.ts's fetchEarningsFromIndexer comment) - this
  // is the immediate unblock, not the final design.
  idleTimeout: 45,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeadersFor(req) });
    }
    if (url.pathname === "/health") {
      return withCors(Response.json({ status: "ok" }), req);
    }
    if (url.pathname === "/auth/x/login" && req.method === "GET") {
      return startXLogin(req);
    }
    if (url.pathname === "/auth/x/callback" && req.method === "GET") {
      return handleXCallback(req);
    }
    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      try {
        const res = await getMe(req);
        return withCors(res, req);
      } catch (err) {
        console.error("[api] /api/auth/me failed:", err);
        return withCors(Response.json({ authenticated: false }, { status: 500 }), req);
      }
    }
    if (url.pathname === "/api/search" && req.method === "GET") {
      const clientIp = getClientIp(req, server);
      const limit = checkSearchSuggestRouteLimit(clientIp);
      if (!limit.allowed) {
        return withCors(tooManyRequests(limit.retryAfterSeconds), req);
      }
      const query = url.searchParams.get("query")?.trim() ?? "";
      if (query.length < 2) {
        return withCors(Response.json({ results: [] }), req);
      }
      try {
        const results = await wrappedService.searchHandles(query);
        return withCors(Response.json({ results: results.slice(0, 8) }), req);
      } catch (err) {
        console.error("[api] search request failed:", err);
        return withCors(Response.json({ results: [] }), req);
      }
    }
    // Proxies external avatar images (Twitter/Farcaster CDNs) so the
    // browser can canvas-capture them for the share-card download/native
    // share. html-to-image's canvas taints on cross-origin images unless
    // the RESPONSE itself carries proper CORS headers - proxying through
    // our own server lets us guarantee that, regardless of whether the
    // original CDN sends permissive headers or not. Allowlisted to known
    // avatar CDN hosts only, to avoid this becoming an open proxy.
    if (url.pathname === "/api/image-proxy" && req.method === "GET") {
      const target = url.searchParams.get("url");
      if (!target) {
        return withCors(Response.json({ error: "url is required" }, { status: 400 }), req);
      }
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        return withCors(Response.json({ error: "invalid url" }, { status: 400 }), req);
      }
      const ALLOWED_HOSTS = ["pbs.twimg.com", "abs.twimg.com", "imagedelivery.net"];
      if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.includes(parsed.hostname)) {
        return withCors(Response.json({ error: "host not allowed" }, { status: 400 }), req);
      }
      try {
        const imgRes = await fetch(parsed.toString(), { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) throw new Error("upstream fetch failed: " + imgRes.status);
        const body = await imgRes.arrayBuffer();
        const headers = new Headers();
        headers.set("Content-Type", imgRes.headers.get("content-type") ?? "image/jpeg");
        headers.set("Cache-Control", "public, max-age=86400");
        return withCors(new Response(body, { status: 200, headers }), req);
      } catch (err) {
        console.error("[api] image-proxy failed:", err);
        return withCors(Response.json({ error: "failed to fetch image" }, { status: 502 }), req);
      }
    }
    if (url.pathname === "/api/leaderboard" && req.method === "GET") {
      try {
        const res = await getLeaderboardController();
        return withCors(res, req);
      } catch (err) {
        // Never leak the raw technical error to users - log it server-side
        // for us, show something calm and actionable to them.
        console.error("[api] leaderboard request failed:", err);
        return withCors(Response.json(
          { error: "Couldn't load the leaderboard right now. Try again in a moment." },
          { status: 500 }
        ), req);
      }
    }
    const wrappedMatch = url.pathname.match(/^\/api\/wrapped\/([^/]+)$/);
    if (wrappedMatch && req.method === "GET") {
      const clientIp = getClientIp(req, server);
      const limit = checkWrappedRouteLimit(clientIp);
      if (!limit.allowed) {
        return withCors(tooManyRequests(limit.retryAfterSeconds), req);
      }
      try {
        const res = await getWrappedController(req, decodeURIComponent(wrappedMatch[1]));
        return withCors(res, req);
      } catch (err) {
        // Previously leaked the raw "internal error" string straight to the
        // UI with no context - most likely cause is resolveWallet() still
        // throwing outright on a transient Bankr hiccup (unlike the fee
        // fetches, which degrade gracefully). Give the user something
        // calm and actionable instead, log the real error for us.
        console.error("[api] request failed:", err);
        return withCors(Response.json(
          { error: "Couldn't load that Wrapped right now — Bankr's service might be slow or briefly unavailable. Try again in a moment." },
          { status: 500 }
        ), req);
      }
    }
    return withCors(new Response("Not found", { status: 404 }), req);
  },
});
startBackfillSweep("base");
startRefreshSweep("base");
console.log("[api] listening on http://localhost:" + PORT);
fetch("https://api.bankr.bot/users/search?query=warmup", { signal: AbortSignal.timeout(25000) })
  .then(() => console.log("[api] warmup fetch done"))
  .catch(() => console.log("[api] warmup fetch failed (non-fatal)"));
