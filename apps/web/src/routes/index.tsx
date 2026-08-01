import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useCallback, useRef, useState } from "react";
import { ArrowRight, Search, Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BuildingWrappedState } from "@/components/wrapped/BuildingWrappedState";
import { HeaderActions } from "@/components/wrapped/HeaderActions";
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
      { title: "Bankr Wrapped \u00B7 Your Launchpad Year, Animated" },
      {
        name: "description",
        content:
          "A cinematic recap of your Bankr journey: tokens launched, Please Bro tokens, creator earnings and unclaimed rewards.",
      },
      { property: "og:title", content: "Bankr Wrapped \u00B7 Your Launchpad Year, Animated" },
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
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

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
    setSelectedAvatar(null);
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
    setSelectedAvatar(s.profileImageUrl);
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

  const onBuildingDone = useCallback(() => {
    if (notFound) {
      setPhase("no-account");
    } else if (profile) {
      setPhase(profile.hasActivity ? "story" : "revealing");
    } else {
      setPhase("search");
    }
  }, [notFound, profile]);

  let content;

  if (phase === "intro") {
    content = <SceneMilestones onDone={() => setPhase("search")} />;
  } else if (phase === "building") {
    content = (
      <BuildingWrappedState
        apiDone={apiDone}
        onDone={onBuildingDone}
        handle={handle}
        avatarUrl={selectedAvatar}
      />
    );
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
        <img
          src="/liquid-glass-bg.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/55 to-background/85" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-accent/20" />

        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 16 }}
          className="absolute left-5 right-5 top-5 z-20 flex items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
            </div>
            <span className="font-display text-sm font-bold tracking-tight">
              Bankr <span className="text-gradient">Wrapped</span>
            </span>
          </div>
          <HeaderActions />
        </motion.div>

        <div className="relative z-10 w-full max-w-lg space-y-7 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 120, damping: 16 }}
            className="space-y-3"
          >
            <h1 className="font-display text-5xl font-extrabold sm:text-6xl">
              Discover your year on Bankr
            </h1>
            <p className="text-base text-muted-foreground">
              Search your X or Farcaster username
            </p>
          </motion.div>

          <motion.form
            onSubmit={(e) => {
              e.preventDefault();
              void run(handle);
            }}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.12 }}
            className="glass relative space-y-3 rounded-3xl p-4 backdrop-blur-xl"
          >
            <div className="animate-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" />
            <div ref={searchBoxRef} className="relative">
              <div className="flex items-center gap-3 rounded-2xl border border-glass-border bg-background/30 px-4 py-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
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
                {handle.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onHandleInputChange("")}
                    aria-label="Clear"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="relative z-20 mt-2 overflow-hidden rounded-2xl border border-glass-border bg-background text-left shadow-2xl"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button type="submit" variant="hero" size="xl" className="w-full">
              View My Wrapped <ArrowRight className="size-4" />
            </Button>
          </motion.form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-1.5"
          >
            <p className="text-xs text-muted-foreground">
              "Please Bro" tokens are ones where someone redirected their creator fees to you.
            </p>
            <p className="text-xs text-muted-foreground">
              Shows your activity on Bankr specifically &mdash; not other launchpads.
            </p>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass space-y-2 rounded-2xl px-4 py-3"
              role="alert"
            >
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => void run(handle)}
                className="text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Try again
              </button>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Link
              to="/leaderboard"
              className="glass mx-auto flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40"
            >
              <Trophy className="size-4 text-accent" /> View leaderboard
            </Link>
          </motion.div>
        </div>
      </main>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
// deploy trigger 1785570270
