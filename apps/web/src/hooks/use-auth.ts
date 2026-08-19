// apps/web/src/hooks/use-auth.ts
//
// The single seam between the frontend and Module 14's auth. The session
// cookie is httpOnly by design — the frontend can NEVER read it directly —
// so authentication state is learned only by asking the server via
// GET /api/auth/me with credentials included (so the cookie is sent).
//
// Server contract (Module 14):
//   200 { authenticated: true,  xUsername, evmAddress: "0x..." } → signed in, wallet resolved
//   200 { authenticated: true,  xUsername, evmAddress: null    } → signed in, no Bankr account (yet)
//   401 { authenticated: false }                                 → not signed in / expired
//   500 { authenticated: false }                                 → server error
//
// Wallet resolution is fully server-side inside /api/auth/me (including the
// on-the-fly resolveWallet retry when evmAddress was null at login). The
// frontend must NOT call /api/search or any resolve path itself — it just
// consumes evmAddress.

import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type AuthState =
  | { status: "checking" }
  | { status: "signed-out" }
  // Signed in, wallet resolved — feed evmAddress straight into the wrapped lookup.
  | { status: "signed-in"; xUsername: string; evmAddress: string }
  // Signed in, but no Bankr account resolved (evmAddress null) — routes to the
  // no-account page.
  | { status: "no-account"; xUsername: string }
  // The auth check itself failed in a way we couldn't classify — treated as
  // signed-out for routing, but distinguished so the UI could show a retry if desired.
  | { status: "error" };

type MeResponse = {
  authenticated: boolean;
  xUsername?: string;
  evmAddress?: string | null;
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          // Required: sends the httpOnly session cookie cross-origin.
          credentials: "include",
        });

        // 401 → not signed in. Any non-OK that isn't a clean 401 is treated
        // as signed-out for routing (the shape agrees), but we check status
        // rather than trusting the body alone.
        if (res.status === 401) {
          if (!cancelled) setState({ status: "signed-out" });
          return;
        }

        if (!res.ok) {
          if (!cancelled) setState({ status: "signed-out" });
          return;
        }

        const data: MeResponse = await res.json();

        if (!data.authenticated) {
          if (!cancelled) setState({ status: "signed-out" });
          return;
        }

        // Authenticated. Branch on whether a wallet was resolved.
        if (data.evmAddress) {
          if (!cancelled) {
            setState({
              status: "signed-in",
              xUsername: data.xUsername ?? "",
              evmAddress: data.evmAddress,
            });
          }
        } else {
          if (!cancelled) {
            setState({ status: "no-account", xUsername: data.xUsername ?? "" });
          }
        }
      } catch {
        // Network/parse failure — distinct from a clean signed-out so the UI
        // can offer a retry rather than silently showing the landing page.
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}