// apps/web/src/routes/index.tsx
//
// Lookup-first root route. No sign-in: a Wrapped is public on-chain data, so
// the handle lives in the URL (/?u=<handle>) and every Wrapped has a link.
//   no ?u       → Landing (with the handle lookup)
//   ?u=<handle> → fetch that Wrapped, then the story and its cards
//                 (WrappedExperience); an unknown handle gets NotFound.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { BuildingWrappedState } from "@/components/wrapped/BuildingWrappedState";
import { WrappedExperience } from "@/components/wrapped/WrappedExperience";
import { Landing } from "@/components/wrapped/Landing";
import { Lookup } from "@/components/wrapped/landing/Lookup";
import {
  lookupWrapped,
  normalizeHandle,
  WrappedNotFoundError,
  type WrappedProfile,
} from "@/lib/wrapped-data";

type IndexSearch = { u?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const u = typeof search.u === "string" ? normalizeHandle(search.u) : "";
    return u ? { u } : {};
  },
  head: () => ({
    meta: [
      { title: "Bankr Wrapped \u00B7 Your Launchpad Year" },
      {
        name: "description",
        content:
          "A cinematic recap of a Bankr year: tokens launched, Please Bro tokens, earnings, and lifetime volume. Look up any handle.",
      },
      { property: "og:title", content: "Bankr Wrapped" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { u } = Route.useSearch();
  // Keyed by handle so a new lookup starts from a clean state.
  return u ? <WrappedFor key={u} handle={u} /> : <Landing />;
}

// Trading volume is computed in the background: re-ask while it's pending
// or still filling in, so the volume card updates without a reload.
const VOLUME_POLL_MS = 30_000;
const VOLUME_POLL_MAX = 20;

// Fetch the Wrapped by handle (the backend resolves handle→wallet→data), then
// show the story and cards. No-activity handles are NOT gated out — they get
// the same deck with honest small numbers (locked decision).
function WrappedFor({ handle: xUsername }: { handle: string }) {
  const [profile, setProfile] = useState<WrappedProfile | null>(null);
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
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
        if (cancelled) return;
        setError({
          notFound: e instanceof WrappedNotFoundError,
          message: e instanceof Error ? e.message : "Something went wrong",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [xUsername, attempt]);

  // Poll while volume is pending or still a floor. "none" never resolves (no
  // launches to count), so it isn't polled.
  const tv = profile?.tradingVolume;
  const volumeSettled =
    !tv ||
    tv.status === "none" ||
    tv.status === "unavailable" ||
    (tv.status === "ok" && tv.isComplete);
  useEffect(() => {
    if (volumeSettled) return;
    let polls = 0;
    const t = setInterval(() => {
      if (++polls > VOLUME_POLL_MAX) {
        clearInterval(t);
        // A computation that failed on the API stays "pending" forever: stop
        // saying it's being counted. An "at least" floor stays as it is.
        setProfile((p) =>
          p && p.tradingVolume.status === "pending"
            ? { ...p, tradingVolume: { ...p.tradingVolume, status: "unavailable" } }
            : p,
        );
        return;
      }
      // A failed poll just waits for the next one; the cards already shown stay.
      lookupWrapped(xUsername).then(setProfile, () => {});
    }, VOLUME_POLL_MS);
    return () => clearInterval(t);
  }, [volumeSettled, xUsername]);

  if (error?.notFound) return <NotFound handle={xUsername} />;
  if (error) return <LoadError message={error.message} onRetry={() => setAttempt((a) => a + 1)} />;
  if (intro || !profile) {
    return (
      <BuildingWrappedState
        apiDone={profile !== null}
        onDone={endIntro}
        handle={xUsername}
        avatarUrl={null}
      />
    );
  }

  return <WrappedExperience profile={profile} />;
}

function NotFound({ handle }: { handle: string }) {
  return (
    <Centered>
      <p style={meta}>No Wrapped for @{handle}</p>
      <h1 style={title}>That handle doesn&rsquo;t have a Bankr wallet</h1>
      <p style={body}>
        Wrapped needs a Bankr account linked to the handle. Check the spelling, or look up someone
        else.
      </p>
      <div style={{ marginTop: "32px", width: "100%" }}>
        <Lookup autoFocus />
      </div>
      <Link to="/" style={back}>
        Back to the start
      </Link>
    </Centered>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Centered>
      <p style={meta}>Couldn&rsquo;t load this Wrapped</p>
      <h1 style={title}>Something went wrong on our side</h1>
      <p style={body}>{message}</p>
      <div style={{ display: "flex", gap: "8px", marginTop: "32px" }}>
        <button type="button" onClick={onRetry} className="btn-primary" style={primaryBtn}>
          Try again
        </button>
        <Link to="/" className="btn-secondary" style={secondaryBtn}>
          Look up someone else
        </Link>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={centered}>
      <div style={{ width: "100%", maxWidth: "34rem" }}>{children}</div>
    </div>
  );
}

const centered: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 20px",
  background: "#141415",
};

const meta: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  lineHeight: "16px",
  color: "#85858b",
  margin: 0,
};

const title: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  fontSize: "32px",
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  color: "#ededed",
  margin: "12px 0 0",
};

const body: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#a1a1a6",
  margin: "12px 0 0",
};

const back: React.CSSProperties = {
  display: "inline-block",
  marginTop: "24px",
  fontSize: "14px",
  color: "#a1a1a6",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};

const primaryBtn: React.CSSProperties = {
  height: "44px",
  padding: "0 20px",
  borderRadius: "10px",
  border: "none",
  background: "#ededed",
  color: "#141415",
  fontWeight: 500,
  fontSize: "15px",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "44px",
  padding: "0 20px",
  borderRadius: "10px",
  border: "1px solid rgba(237,237,237,0.14)",
  background: "#232325",
  color: "#ededed",
  fontWeight: 500,
  fontSize: "15px",
  textDecoration: "none",
};
