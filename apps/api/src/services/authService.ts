// X OAuth 2.0 Authorization Code + PKCE flow (Module 14). Confidential
// client (Web App type, has a Client Secret) - see docs.x.com/fundamentals/
// authentication/oauth-2-0/authorization-code for the confirmed flow this
// follows. Scopes: users.read (resolve the signed-in X username) +
// offline.access (issues a refresh token, per the long-lived-session
// decision) - deliberately no tweet/dm/like scopes, we never touch those.
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const USERS_ME_URL = "https://api.x.com/2/users/me";
const SCOPES = "users.read offline.access";
const FETCH_TIMEOUT_MS = 10_000;

export interface PkcePair {
  verifier: string;
  challenge: string;
}
// verifier: 43-128 char URL-safe string per RFC 7636 - 32 random bytes,
// base64url-encoded, lands well within that range.
function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function generateState(): string {
  return randomBytes(16).toString("base64url");
}

function buildAuthorizeUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.X_REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return AUTHORIZE_URL + "?" + params.toString();
}

interface XTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token?: string;
}
// Auth code expires 30s after user approval per X's docs - this must be
// called immediately from the callback handler, never queued/delayed.
async function exchangeCodeForToken(code: string, verifier: string): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.X_REDIRECT_URI,
    code_verifier: verifier,
  });
  // Confidential client: authenticate via Basic auth (client_id:client_secret),
  // not a client_id body param - per X's docs, confidential clients don't
  // need client_id in the body when using a valid Authorization header.
  const basicAuth = Buffer.from(env.X_CLIENT_ID + ":" + env.X_CLIENT_SECRET).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + basicAuth,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("X token exchange failed: " + res.status + " " + text);
  }
  return (await res.json()) as XTokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basicAuth = Buffer.from(env.X_CLIENT_ID + ":" + env.X_CLIENT_SECRET).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + basicAuth,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("X token refresh failed: " + res.status + " " + text);
  }
  return (await res.json()) as XTokenResponse;
}

interface XUser {
  id: string;
  username: string;
}
async function fetchXUser(accessToken: string): Promise<XUser> {
  const res = await fetch(USERS_ME_URL, {
    headers: { "Authorization": "Bearer " + accessToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("X /users/me failed: " + res.status + " " + text);
  }
  const json = (await res.json()) as { data: XUser };
  return json.data;
}

export const authService = {
  generatePkce,
  generateState,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchXUser,
};
