// apps/web/src/routes/index.tsx
//
// Auth-first root route. On mount we ask the server who we are via useAuth
// (GET /api/auth/me), then branch:
//   checking    → minimal checking state
//   signed-out  → Landing
//   error       → Landing (handles its own auth-error affordance)
//   no-account  → NoAccountState (signed in, no Bankr wallet resolved)
//   signed-in   → fetch wrapped by handle, then run the reveal
//
// The WebGL braid reveal is being rebuilt — RevealPlaceholder stands in for
// it so the app boots. Auth branching below is final and should not need to
// change when the real reveal lands; it just replaces RevealPlaceholder.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { NoAccountState } from "@/components/wrapped/NoAccountState";
import { Landing } from "@/components/wrapped/Landing";
import { useAuth } from "@/hooks/use-auth";
import { lookupWrapped, type WrappedProfile } from "@/lib/wrapped-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bankr Wrapped \u00B7 Your Launchpad Year" },
      {
        name: "description",
        content:
          "A cinematic recap of your Bankr year: tokens launched, Please Bro tokens, earnings, and lifetime volume.",
      },
      { property: "og:title", content: "Bankr Wrapped" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const auth = useAuth();

  return (
    <>
      {auth.status === "checking" ? <Checking /> : null}
      {auth.status === "signed-out" || auth.status === "error" ? <Landing /> : null}
      {auth.status === "no-account" ? <NoAccountState onBack={reload} /> : null}
      {auth.status === "signed-in" ? <SignedIn xUsername={auth.xUsername} /> : null}
    </>
  );
}

function reload() {
  if (typeof window !== "undefined") window.location.assign("/");
}

// Signed-in branch: fetch the wrapped profile by handle (Option A — backend
// resolves handle→wallet→data on the existing route), then run the reveal.
// Note: no-activity users are NOT gated out — they run the same reveal with
// honest small numbers (locked decision).
function SignedIn({ xUsername }: { xUsername: string }) {
  const [profile, setProfile] = useState<WrappedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setProfile(null);
    lookupWrapped(xUsername)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      });
    return () => {
      cancelled = true;
    };
  }, [xUsername]);

  if (error) return <LoadError message={error} />;
  if (!profile) return <Checking />;

  return <RevealPlaceholder profile={profile} />;
}

// Placeholder for the WebGL braid reveal (being rebuilt). Shows the real
// resolved profile data so the signed-in path is verifiable end to end.
function RevealPlaceholder({ profile }: { profile: WrappedProfile }) {
  return (
    <div style={centered}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <span style={checkingText}>{"> reveal coming soon"}</span>
        <span style={{ ...checkingText, opacity: 0.6, fontSize: "0.8rem" }}>
          signed in as @{profile.handle} · {profile.tokensLaunched} launched ·{" "}
          {profile.pleaseBro.length} please bro
        </span>
      </div>
    </div>
  );
}

function Checking() {
  return (
    <div style={centered}>
      <span style={checkingText}>{"> authenticating…"}</span>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div style={centered}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <span style={checkingText}>{"> couldn't load your wrapped"}</span>
        <span style={{ ...checkingText, opacity: 0.6, fontSize: "0.8rem" }}>{message}</span>
        <button type="button" onClick={reload} style={retryBtn}>
          retry
        </button>
      </div>
    </div>
  );
}

const centered: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "var(--background, #0c0a09)",
};

const checkingText: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'Departure Mono', ui-monospace, monospace)",
  fontSize: "0.9rem",
  color: "var(--muted-foreground, #8a83a0)",
  letterSpacing: "0.05em",
};

const retryBtn: React.CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border, rgba(255,255,255,0.12))",
  background: "transparent",
  borderRadius: "0.5rem",
  padding: "0.5rem 1.25rem",
  fontFamily: "var(--font-mono, 'Departure Mono', ui-monospace, monospace)",
  fontSize: "0.85rem",
  color: "var(--foreground, #f7f4f0)",
  cursor: "pointer",
};
