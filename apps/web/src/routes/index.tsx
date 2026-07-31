import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BuildingWrappedState } from "@/components/wrapped/BuildingWrappedState";
import { NoAccountState } from "@/components/wrapped/NoAccountState";
import { NoActivityState } from "@/components/wrapped/NoActivityState";
import { SceneMilestones } from "@/components/wrapped/SceneMilestones";
import { SceneNoActivityReveal } from "@/components/wrapped/SceneNoActivityReveal";
import { WrappedStory } from "@/components/wrapped/WrappedStory";
import {
  lookupWrapped,
  searchHandles,
  WrappedNotFoundError,
  type SearchSuggestion,
  type WrappedProfile,
} from "@/lib/wrapped-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bankr Wrapped \u2014 Your Launchpad Year, Animated" },
      {
        name: "description",
        content:
          "A cinematic recap of your Bankr journey: tokens launched, Please Bro tokens, creator earnings and unclaimed rewards.",
      },
      { property: "og:title", content: "Bankr Wrapped \u2014 Your Launchpad Year, Animated" },
      {
        property: "og:description",
        content:
          "See your tokens, volume and lifetime earnings in an animated Bankr Wrapped story.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Phase =
  | "intro"
  | "search"
  | "building"
  | "revealing"
  | "no-activity"
  | "no-account"
  | "story";

const PLATFORM_LABEL: Record<SearchSuggestion["platform"], string> = {
  twitter: "X",
  farcaster: "Farcaster",
};

function Index() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [handle, setHandle] = useState("");
  const [profile, setProfile] = useState<WrappedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [apiDone, setApiDone] = useState(false);

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSuggestions(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const backToSearch = () => {
    setProfile(null);
    setError(null);
    setNotFound(false);
    setPhase("search");
  };

  const onHandleInputChange = (value: string) => {
    setHandle(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void searchHandles(trimmed).then((results) => {
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      });
    }, 350);
  };

  const selectSuggestion = (s: SearchSuggestion) => {
    setHandle(s.username);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const run = async (value: string) => {
    if (!value.trim()) return;
    setShowSuggestions(false);
    setError(null);
    setNotFound(false);
    setProfile(null);
    setApiDone(false);
    setPhase("building");
    try {
      const result = await lookupWrapped(value);
      setProfile(result);
    } catch (err) {
      if (err instanceof WrappedNotFoundError) {
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setApiDone(true);
    }
  };

  const onBuildingDone = () => {
    if (notFound) {
      setPhase("no-account");
    } else if (profile) {
      setPhase(profile.hasActivity ? "story" : "revealing");
    } else {
      // real fetch failed with a non-404 error - back to search with the message shown
      setPhase("search");
    }
  };

  let content;

  if (phase === "intro") {
    content = <SceneMilestones onDone={() => setPhase("search")} />;
  } else if (phase === "building") {
    content = <BuildingWrappedState apiDone={apiDone} onDone={onBuildingDone} />;
  } else if (phase === "revealing" && profile) {
    content = (
      <SceneNoActivityReveal
        profile={profile}
        onDone={() => setPhase("no-activity")}
      />
    );
  } else if (phase === "no-activity") {
    content = <NoActivityState onBack={backToSearch} />;
  } else if (phase === "no-account") {
    content = <NoAccountState onBack={backToSearch} />;
  } else if (phase === "story" && profile) {
    content = <WrappedStory profile={profile} onRestart={backToSearch} />;
  } else {
    content = (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5">
        <div className="pointer-events-none absolute -left-32 top-0 size-[30rem] animate-drift rounded-full bg-primary/30 blur-[130px]" />
        <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

        <div className="relative z-10 w-full max-w-lg space-y-8 text-center">
          <div className="animate-rise flex items-center justify-center gap-3">
            <span className="font-display text-sm font-bold uppercase tracking-[0.3em]">
              Bankr <span className="text-gradient">Wrapped</span> 2026
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="animate-rise font-display text-5xl font-extrabold sm:text-6xl">
              Discover your year on Bankr
            </h1>
            <p
              className="animate-rise text-base text-muted-foreground"
              style={{ animationDelay: "120ms" }}
            >
              Search your X or Farcaster username
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(handle);
            }}
            className="animate-rise space-y-3"
            style={{ animationDelay: "220ms" }}
          >
            <div ref={searchBoxRef} className="relative">
              <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={handle}
                  onChange={(e) => onHandleInputChange(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="@username"
                  aria-label="X or Farcaster username"
                  autoComplete="off"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="glass absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl text-left">
                  {suggestions.map((s) => (
                    <button
                      key={s.platform + ":" + s.username}
                      type="button"
                      onClick={() => selectSuggestion(s)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/10"
                    >
                      <img
                        src={s.profileImageUrl}
                        alt={s.username}
                        className="size-8 shrink-0 rounded-full object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          @{s.username}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                        {PLATFORM_LABEL[s.platform]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" variant="hero" size="xl" className="w-full">
              View My Wrapped <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="animate-rise text-xs text-muted-foreground" style={{ animationDelay: "260ms" }}>
            "Please Bro" tokens are ones where someone redirected their creator fees to you.
          </p>

          {error && (
            <p className="animate-rise text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Link
            to="/leaderboard"
            className="animate-rise block text-sm text-muted-foreground underline-offset-4 hover:underline"
            style={{ animationDelay: "280ms" }}
          >
            View leaderboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen">
      <video
        className="pointer-events-none fixed inset-0 size-full object-cover opacity-20"
        src="/bankr-ambient.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      {content}
    </div>
  );
}
