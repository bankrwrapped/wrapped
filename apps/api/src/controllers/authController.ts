import { authService } from "../services/authService";
import { sessionsRepository } from "../repositories/sessionsRepository";
import { sessionCrypto } from "../utils/sessionCrypto";
import { wrappedService } from "../services/wrappedService";
import { serializeCookie, clearCookie, parseCookies } from "../utils/cookies";

const PKCE_COOKIE = "x_oauth_pkce";
const SESSION_COOKIE = "session";
const PKCE_COOKIE_MAX_AGE_SECONDS = 600; // 10 min - long enough for a real login, short-lived by design
// Policy choice, not an X-documented limit - how long a signed-in session
// stays valid before requiring a fresh login. Refresh token itself may
// outlive this; this bounds our own session cookie/DB row regardless.
const SESSION_LIFETIME_DAYS = 180;

const FRONTEND_ROOT = "https://bankrwrapped.com/";

// Secure cookies require an HTTPS context - Railway production is https,
// but local dev hits this over http://localhost. Chrome/Firefox treat
// localhost as a secure-context exception, but Secure-flagged cookies are
// still rejected over plain http in some browsers/versions - safest to key
// this off the actual request protocol rather than assume.
function isSecureRequest(req: Request): boolean {
  return new URL(req.url).protocol === "https:";
}

export async function startXLogin(req: Request): Promise<Response> {
  const { verifier, challenge } = authService.generatePkce();
  const state = authService.generateState();
  const authorizeUrl = authService.buildAuthorizeUrl(state, challenge);

  const cookieValue = JSON.stringify({ state, verifier });
  const headers = new Headers({ Location: authorizeUrl });
  headers.append(
    "Set-Cookie",
    serializeCookie(PKCE_COOKIE, cookieValue, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: "Lax", // must survive the top-level cross-site redirect from x.com
      path: "/",
      maxAgeSeconds: PKCE_COOKIE_MAX_AGE_SECONDS,
    })
  );
  return new Response(null, { status: 302, headers });
}

export async function handleXCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    console.error("[auth] X returned an OAuth error:", oauthError);
    return redirectToRootWithClearedPkce(req, "auth_denied");
  }
  if (!code || !returnedState) {
    console.error("[auth] callback missing code or state");
    return redirectToRootWithClearedPkce(req, "auth_failed");
  }

  const cookies = parseCookies(req.headers.get("cookie"));
  const pkceCookieRaw = cookies[PKCE_COOKIE];
  if (!pkceCookieRaw) {
    console.error("[auth] callback with no pkce cookie - expired or missing");
    return redirectToRootWithClearedPkce(req, "auth_expired");
  }

  let storedState: string;
  let verifier: string;
  try {
    const parsed = JSON.parse(pkceCookieRaw) as { state: string; verifier: string };
    storedState = parsed.state;
    verifier = parsed.verifier;
  } catch {
    console.error("[auth] malformed pkce cookie");
    return redirectToRootWithClearedPkce(req, "auth_failed");
  }

  if (storedState !== returnedState) {
    console.error("[auth] state mismatch - possible CSRF attempt");
    return redirectToRootWithClearedPkce(req, "auth_failed");
  }

  try {
    const tokenRes = await authService.exchangeCodeForToken(code, verifier);
    if (!tokenRes.refresh_token) {
      // Should never happen given offline.access is always requested in
      // buildAuthorizeUrl - if X's behavior changes, fail loudly, don't
      // silently create a session with no way to renew.
      throw new Error("X did not return a refresh_token despite offline.access scope");
    }

    const xUser = await authService.fetchXUser(tokenRes.access_token);
    const match = await wrappedService.resolveWallet(xUser.username);

    const sessionId = sessionCrypto.generateSessionId();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    await sessionsRepository.create({
      id: sessionId,
      xUserId: xUser.id,
      xUsername: xUser.username,
      evmAddress: match?.evmAddress ?? null,
      refreshTokenEncrypted: sessionCrypto.encrypt(tokenRes.refresh_token),
      expiresAt,
    });

    const headers = new Headers({ Location: FRONTEND_ROOT });
    headers.append("Set-Cookie", clearCookie(PKCE_COOKIE, { path: "/" }));
    headers.append(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: "Lax",
        path: "/",
        maxAgeSeconds: SESSION_LIFETIME_DAYS * 24 * 60 * 60,
      })
    );
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("[auth] callback failed:", err);
    return redirectToRootWithClearedPkce(req, "auth_failed");
  }
}

export async function getMe(req: Request): Promise<Response> {
  const cookies = parseCookies(req.headers.get("cookie"));
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  const session = await sessionsRepository.findValidById(sessionId);
  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  await sessionsRepository.touchLastUsed(sessionId);

  let evmAddress = session.evmAddress;
  // Retry path: session was created with evmAddress null (no Bankr account
  // at login time). Re-resolve here rather than making the frontend call
  // the existing /api/search-style resolve path separately - keeps wallet
  // resolution entirely server-side and behind this one endpoint. Only
  // costs an extra Bankr call in this specific stale-null case, not on
  // every /api/auth/me hit.
  if (evmAddress === null) {
    const match = await wrappedService.resolveWallet(session.xUsername);
    if (match) {
      evmAddress = match.evmAddress;
      await sessionsRepository.updateEvmAddress(sessionId, evmAddress);
    }
  }

  return Response.json({
    authenticated: true,
    xUsername: session.xUsername,
    evmAddress,
  });
}

function redirectToRootWithClearedPkce(req: Request, errorCode: string): Response {
  const headers = new Headers({ Location: FRONTEND_ROOT + "?error=" + errorCode });
  headers.append("Set-Cookie", clearCookie(PKCE_COOKIE, { path: "/" }));
  return new Response(null, { status: 302, headers });
}
