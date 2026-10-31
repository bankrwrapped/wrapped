// apps/web/src/routes/index.tsx
//
// Auth-first root route. On mount we ask the server who we are via useAuth
// (GET /api/auth/me), then branch:
//   checking    → minimal checking state
//   signed-out  → Landing
//   error       → Landing (handles its own auth-error affordance)
//   no-account  → NoAccountState (signed in, no Bankr wallet resolved)
//   signed-in   → fetch wrapped by handle, then the card deck
//
// The WebGL braid reveal is being rebuilt; when it lands it plays before
// WrappedDeck, which stays as the shareable card view after it.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { BuildingWrappedState } from "@/components/wrapped/BuildingWrappedState";
import { NoAccountState } from "@/components/wrapped/NoAccountState";
import { WrappedDeck } from "@/components/wrapped/WrappedDeck";
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

// Trading volume is computed in the background: re-ask while it's pending
// or still filling in, so the volume card updates without a reload.
const VOLUME_POLL_MS = 30_000;
const VOLUME_POLL_MAX = 20;

// Signed-in branch: fetch the wrapped profile by handle (Option A — backend
// resolves handle→wallet→data on the existing route), then show the cards.
// Note: no-activity users are NOT gated out — they get the same deck with
// honest small numbers (locked decision).
function SignedIn({ xUsername }: { xUsername: string }) {
  const [profile, setProfile] = useState<WrappedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);

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

  const volumeSettled = profile ? profile.tradingVolume.status === "ok" && profile.tradingVolume.isComplete : true;
  useEffect(() => {
    if (volumeSettled) return;
    let polls = 0;
    const t = setInterval(() => {
      if (++polls > VOLUME_POLL_MAX) return clearInterval(t);
      // A failed poll just waits for the next one; the cards already shown stay.
      lookupWrapped(xUsername).then(setProfile, () => {});
    }, VOLUME_POLL_MS);
    return () => clearInterval(t);
  }, [volumeSettled, xUsername]);

  if (error) return <LoadError message={error} />;
  if (intro || !profile) {
    return <BuildingWrappedState apiDone={profile !== null} onDone={endIntro} handle={xUsername} avatarUrl={null} />;
  }

  return <WrappedDeck profile={profile} />;
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
