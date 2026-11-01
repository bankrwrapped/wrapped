// Railway sits in front of this app behind its own edge proxy, so
// server.requestIP() returns Railway's internal address for every request,
// not the visitor's. The client IP has to come from a header the PROXY
// writes, never from one the client controls:
//  - X-Real-IP: set (overwritten) by Railway's edge to the connecting client.
//  - X-Forwarded-For: proxies APPEND, so only the last entry was added by
//    the proxy in front of us. The first entry is whatever the client sent -
//    keying on it let anyone pick a fresh rate-limit bucket per request.
// TRUSTED_PROXY_HOPS (default 1) says how many proxies append to XFF.
// With neither header (local dev, no proxy) the socket address is used.
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
export function getClientIp(req: Request, socketIp: string | null | undefined): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const fromProxy = hops[hops.length - TRUSTED_PROXY_HOPS];
    if (fromProxy) return fromProxy;
  }
  return socketIp ?? "unknown";
}
