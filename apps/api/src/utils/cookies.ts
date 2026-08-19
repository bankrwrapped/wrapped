// Minimal cookie parse/serialize for raw Bun.serve - no framework here to
// provide this. Only the attributes Module 14 actually needs; not a
// general-purpose cookie library.
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
  maxAgeSeconds?: number;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [name + "=" + encodeURIComponent(value)];
  if (opts.path) parts.push("Path=" + opts.path);
  if (opts.maxAgeSeconds !== undefined) parts.push("Max-Age=" + opts.maxAgeSeconds);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push("SameSite=" + opts.sameSite);
  return parts.join("; ");
}

// Deletion is just a normal Set-Cookie with Max-Age=0 - not a special
// operation, but named separately so call sites read clearly.
export function clearCookie(name: string, opts: Pick<CookieOptions, "path"> = {}): string {
  return serializeCookie(name, "", { path: opts.path ?? "/", maxAgeSeconds: 0 });
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}
