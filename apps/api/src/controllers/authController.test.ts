// Sign-in: cookies are Secure behind Railway's TLS-terminating proxy
// (X-Forwarded-Proto), SameSite=Lax (first-party via the frontend proxy),
// a malformed cookie can't 500 the callback, and the wallet re-resolve for
// wallet-less sessions is throttled per session.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

let resolveCalls = 0;
let resolveResult: { evmAddress: string } | null = null;
const createdSessions: unknown[] = [];

mock.module("../services/authService", () => ({
  authService: {
    generatePkce: () => ({ verifier: "ver", challenge: "chal" }),
    generateState: () => "state-1",
    buildAuthorizeUrl: () => "https://x.com/i/oauth2/authorize?x=1",
    exchangeCodeForToken: async () => ({ access_token: "at", refresh_token: "rt" }),
    fetchXUser: async () => ({ id: "42", username: "alice" }),
  },
}));
mock.module("../services/wrappedService", () => ({
  wrappedService: {
    resolveWallet: async () => { resolveCalls += 1; return resolveResult; },
  },
}));
mock.module("../repositories/sessionsRepository", () => ({
  sessionsRepository: {
    create: async (s: unknown) => { createdSessions.push(s); },
    findValidById: async (id: string) => ({ id, xUserId: "42", xUsername: "alice", evmAddress: null }),
    touchLastUsed: async () => {},
    updateEvmAddress: async () => {},
  },
}));

const { startXLogin, handleXCallback, getMe } = await import("./authController");

beforeEach(() => { resolveCalls = 0; resolveResult = null; createdSessions.length = 0; });

// Railway terminates TLS: the app sees http:// with X-Forwarded-Proto: https.
const behindProxy = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://wrapped-production.up.railway.app${path}`, {
    headers: { "x-forwarded-proto": "https", ...headers },
  });

test("login cookie is Secure behind Railway's proxy, Lax, HttpOnly", async () => {
  const res = await startXLogin(behindProxy("/auth/x/login"));
  expect(res.status).toBe(302);
  const [cookie] = res.headers.getSetCookie();
  expect(cookie).toContain("x_oauth_pkce=");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("HttpOnly");
});

test("plain local http (no proxy header) doesn't set Secure", async () => {
  const res = await startXLogin(new Request("http://localhost:4000/auth/x/login"));
  expect(res.headers.getSetCookie()[0]).not.toContain("Secure");
});

test("callback sets a Secure, Lax session cookie - even with a malformed unrelated cookie present", async () => {
  const pkce = encodeURIComponent(JSON.stringify({ state: "state-1", verifier: "ver" }));
  const res = await handleXCallback(
    behindProxy("/auth/x/callback?code=c&state=state-1", {
      // `%E0%A4%A` is an invalid escape: decodeURIComponent throws on it.
      cookie: `junk=%E0%A4%A; x_oauth_pkce=${pkce}`,
    }),
  );
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("https://bankrwrapped.com/");
  const session = res.headers.getSetCookie().find((c) => c.startsWith("session="));
  expect(session).toBeDefined();
  expect(session).toContain("Secure");
  expect(session).toContain("SameSite=Lax");
  expect(createdSessions.length).toBe(1);
});

test("state mismatch is rejected", async () => {
  const pkce = encodeURIComponent(JSON.stringify({ state: "other", verifier: "ver" }));
  const res = await handleXCallback(
    behindProxy("/auth/x/callback?code=c&state=state-1", { cookie: `x_oauth_pkce=${pkce}` }),
  );
  expect(res.headers.get("location")).toBe("https://bankrwrapped.com/?error=auth_failed");
});

test("wallet re-resolve for a wallet-less session runs at most once per window", async () => {
  const req = () => behindProxy("/api/auth/me", { cookie: "session=sess-throttle" });
  const first = await getMe(req());
  const second = await getMe(req());
  expect(first.status).toBe(200);
  expect(await second.json()).toEqual({ authenticated: true, xUsername: "alice", evmAddress: null });
  expect(resolveCalls).toBe(1);
});
