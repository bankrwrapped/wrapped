import { getLeaderboardController, getWrappedController } from "./controllers/wrappedController";
import { checkSearchSuggestRouteLimit, checkWrappedRouteLimit } from "./middleware/rateLimit";
import { wrappedService } from "./services/wrappedService";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
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
function getClientIp(req: Request, server: Bun.Server): string {
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
  // outbound fetches plus a DB write. 30s gives real slowness room to show
  // up as a clear timeout error from OUR code instead of a silent Bun kill.
  idleTimeout: 30,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health") {
      return withCors(Response.json({ status: "ok" }));
    }
    if (url.pathname === "/api/search" && req.method === "GET") {
      const clientIp = getClientIp(req, server);
      const limit = checkSearchSuggestRouteLimit(clientIp);
      if (!limit.allowed) {
        return withCors(tooManyRequests(limit.retryAfterSeconds));
      }
      const query = url.searchParams.get("query")?.trim() ?? "";
      if (query.length < 2) {
        return withCors(Response.json({ results: [] }));
      }
      try {
        const results = await wrappedService.searchHandles(query);
        return withCors(Response.json({ results: results.slice(0, 8) }));
      } catch (err) {
        console.error("[api] search request failed:", err);
        return withCors(Response.json({ results: [] }));
      }
    }

    if (url.pathname === "/api/leaderboard" && req.method === "GET") {
      try {
        const res = await getLeaderboardController();
        return withCors(res);
      } catch (err) {
        console.error("[api] leaderboard request failed:", err);
        return withCors(Response.json({ error: "internal error" }, { status: 500 }));
      }
    }

    const wrappedMatch = url.pathname.match(/^\/api\/wrapped\/([^/]+)$/);
    if (wrappedMatch && req.method === "GET") {
      const clientIp = getClientIp(req, server);
      const limit = checkWrappedRouteLimit(clientIp);
      if (!limit.allowed) {
        return withCors(tooManyRequests(limit.retryAfterSeconds));
      }

      try {
        const res = await getWrappedController(req, decodeURIComponent(wrappedMatch[1]));
        return withCors(res);
      } catch (err) {
        console.error("[api] request failed:", err);
        return withCors(Response.json({ error: "internal error" }, { status: 500 }));
      }
    }

    return withCors(new Response("Not found", { status: 404 }));
  },
});

console.log("[api] listening on http://localhost:" + PORT);
fetch("https://api.bankr.bot/users/search?query=warmup", { signal: AbortSignal.timeout(25000) })
  .then(() => console.log("[api] warmup fetch done"))
  .catch(() => console.log("[api] warmup fetch failed (non-fatal)"));