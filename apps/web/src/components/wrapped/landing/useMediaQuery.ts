// apps/web/src/components/wrapped/landing/useMediaQuery.ts
//
// Detects a media-query match in JS so inline-styled components can swap
// between mobile and desktop style objects (inline styles can't use @media).
// SSR-safe: returns false until mounted, then syncs to the real match.

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Shared breakpoint — one source of truth for "is mobile".
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 760px)");
}