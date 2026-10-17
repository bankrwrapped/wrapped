import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// ---- First-party API proxy -------------------------------------------------
// The API lives on Railway (*.up.railway.app), a different site from
// bankrwrapped.com. Its session cookie was therefore a third-party cookie,
// which Safari and every iOS browser block outright - signed-in users looked
// signed out. Forwarding /api/* and /auth/* through this worker makes the
// browser only ever talk to bankrwrapped.com, so the cookie is first-party
// and works in every browser. The frontend calls these paths relatively
// (see API_URL in lib/wrapped-data.ts).
const DEFAULT_API_ORIGIN = "https://wrapped-production.up.railway.app";

function isProxiedPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/auth/");
}

function apiOrigin(env: unknown): string {
  const fromEnv = (env as { API_ORIGIN?: string } | undefined)?.API_ORIGIN;
  return fromEnv || import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN;
}

async function proxyToApi(request: Request, env: unknown): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, apiOrigin(env));

  const headers = new Headers(request.headers);
  headers.delete("host");
  // The API rate-limits on the first X-Forwarded-For entry and decides the
  // cookie's Secure flag from X-Forwarded-Proto - pass the real visitor's
  // values through, or every visitor collapses into this worker's IP.
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  headers.set("x-forwarded-host", incoming.host);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Pass OAuth 302s (and their Set-Cookie headers) straight to the
    // browser instead of following them here.
    redirect: "manual",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    if (isProxiedPath(new URL(request.url).pathname)) {
      try {
        return await proxyToApi(request, env);
      } catch (error) {
        console.error("[api-proxy] upstream request failed:", error);
        return Response.json(
          { error: "Couldn't reach the Bankr Wrapped API right now. Try again in a moment." },
          { status: 502 },
        );
      }
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
