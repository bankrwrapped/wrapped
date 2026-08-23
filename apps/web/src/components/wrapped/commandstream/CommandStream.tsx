// apps/web/src/components/wrapped/commandstream/CommandStream.tsx
//
// Phase 2 of 2 — the command-stream background, now with two honest
// registers:
//   • ambient layers: illustrative commands + recognizable tickers ($BNW
//     forward), clearly-illustrative amounts (phase 1).
//   • near "truth" layer: REAL fetchLeaderboard() fragments — real handles,
//     real ETH — the genuinely-live data, brighter and orange-accented.
// Plus arrival-beat flares: as scroll passes the locked beat positions, the
// nearest fragment briefly flares orange ("something happened") — the
// punctuation the mascot/coin was going to carry.
//
// Pure DOM/CSS, fixed behind content, pointer-events off. Reuses
// useScrollProgress for drift + parallax.

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchLeaderboard, type LeaderboardEntry } from "@/lib/wrapped-data";
import { useScrollProgress } from "./useScrollProgress";
import { buildFragments, isAccented } from "./fragments";
import { useIsMobile } from "../landing/useMediaQuery";
import { T } from "../landing/tokens";

type Layer = {
  depth: number;
  count: number;
  size: number;
  baseOpacity: number;
  speed: number;
  parallax: number;
  real?: boolean; // near layer pulls real leaderboard fragments
};

const LAYERS: Layer[] = [
  { depth: 0.0, count: 7, size: 12, baseOpacity: 0.1, speed: 6, parallax: 40 },
  { depth: 0.5, count: 5, size: 15, baseOpacity: 0.18, speed: 10, parallax: 90 },
  { depth: 1.0, count: 4, size: 20, baseOpacity: 0.32, speed: 15, parallax: 160, real: true },
];

// Locked arrival-beat scroll positions (match the landing sections where
// orange emphasis belongs: leaderboard, sign-in/CTA regions).
const FLARE_TS = [0.72, 0.9];

type Placed = {
  text: string;
  accent: boolean;
  real: boolean;
  xPct: number;
  yPct: number;
  size: number;
  opacity: number;
  speed: number;
  parallax: number;
  beatT: number; // which scroll position flares this one (or -1)
};

function edgeBiasedX(r: number): number {
  const side = r < 0.5 ? -1 : 1;
  const dist = Math.abs(r - 0.5) * 2;
  const pushed = Math.pow(dist, 0.6);
  return 50 + side * pushed * 46;
}

function useRng(seed: number) {
  const s = useRef(seed);
  return () => {
    s.current = (s.current * 9301 + 49297) % 233280;
    return s.current / 233280;
  };
}

// Real leaderboard entry → a short, honest fragment. Real handle, real ETH.
function realFragment(e: LeaderboardEntry): string {
  const eth = e.totalEarningsEth >= 1 ? e.totalEarningsEth.toFixed(1) : e.totalEarningsEth.toFixed(2);
  return `@${e.username} · ${eth}Ξ`;
}

export function CommandStream() {
  const progress = useScrollProgress();
  const mobile = useIsMobile();
  const rand = useRng(42);
  const [real, setReal] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((rows) => {
        if (!cancelled) setReal(rows.slice(0, 6));
      })
      .catch(() => {
        /* ambient still works without real data */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const placed = useMemo<Placed[]>(() => {
    const pool = buildFragments();
    const realFrags = real.map(realFragment);
    const items: Placed[] = [];
    let flareCursor = 0;

    for (const layer of LAYERS) {
      // Mobile: drop the far (depth 0) layer and thin the rest so fragments
      // never crowd the text on narrow screens.
      if (mobile && layer.depth === 0) continue;
      const layerCount = mobile ? Math.ceil(layer.count / 2) : layer.count;
      for (let i = 0; i < layerCount; i++) {
        // Near layer prefers real fragments when available; falls back to
        // the $BNW-forward pool so it's never empty pre-fetch.
        let text: string;
        let real = false;
        if (layer.real && realFrags.length > 0) {
          text = realFrags[i % realFrags.length];
          real = true;
        } else {
          text = pool[Math.floor(rand() * pool.length)];
        }
        // Assign a couple of near-layer items to flare at the beat positions.
        let beatT = -1;
        if (layer.real && flareCursor < FLARE_TS.length && i < FLARE_TS.length) {
          beatT = FLARE_TS[flareCursor];
          flareCursor++;
        }
        items.push({
          text,
          accent: real || isAccented(text),
          real,
          xPct: edgeBiasedX(rand()),
          yPct: rand() * 100,
          size: layer.size,
          opacity: layer.baseOpacity,
          speed: layer.speed,
          parallax: layer.parallax,
          beatT,
        });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, mobile]);

  const nodesRef = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const scroll = progress.current.value;
      for (let i = 0; i < placed.length; i++) {
        const node = nodesRef.current[i];
        const p = placed[i];
        if (!node) continue;
        if (!reduce) p.yPct -= ((p.speed * dt) / window.innerHeight) * 100;
        if (p.yPct < -10) p.yPct += 120;
        const parallaxY = -scroll * p.parallax;
        node.style.transform = `translate(-50%, ${parallaxY}px)`;
        node.style.top = `${p.yPct}%`;

        // Arrival-beat flare: swell opacity + orange glow as scroll nears the
        // fragment's assigned beat position.
        if (p.beatT >= 0) {
          const d = Math.abs(scroll - p.beatT);
          const prox = d < 0.08 ? 1 - d / 0.08 : 0;
          node.style.opacity = String(p.opacity + prox * 0.6);
          node.style.textShadow = `0 0 ${18 + prox * 22}px rgba(255,122,26,${0.3 + prox * 0.5})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [placed, progress]);

  return (
    <div aria-hidden style={container}>
      {placed.map((p, i) => (
        <div
          key={i}
          ref={(el) => {
            nodesRef.current[i] = el;
          }}
          style={{
            position: "absolute",
            left: `${p.xPct}%`,
            top: `${p.yPct}%`,
            transform: "translate(-50%, 0)",
            fontFamily: T.fontMono,
            fontSize: `${p.size}px`,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            color: p.accent ? T.orangeBright : T.violetBright,
            opacity: p.opacity,
            textShadow: p.accent
              ? `0 0 18px rgba(255,122,26,0.3)`
              : `0 0 18px rgba(159,123,255,0.25)`,
            userSelect: "none",
            fontWeight: p.real ? 500 : 400,
          }}
        >
          {p.text}
        </div>
      ))}
    </div>
  );
}

const container: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  overflow: "hidden",
  background: `radial-gradient(130% 100% at 50% 0%, #0a0a0a 0%, #000 75%)`,
};