// apps/web/src/components/wrapped/landing/LandingHero.tsx
//
// Hero section. Gradient headline + four platform stats as FLOATING numbers
// (not boxed cards) with an easeOutCubic count-up on load, violet/orange
// alternating. Matches the approved mockup. Reduced-motion renders final
// values immediately.
//
// Platform figures are platform-wide static/periodic values — not per-user,
// not fetched. They live here as the hero's content.

import { useEffect, useState } from "react";

import { T, eyebrow } from "./tokens";

const STATS = [
  { prefix: "$", value: 5.01, dec: 2, suffix: "B+", label: "ecosystem volume", accent: "violet" },
  { prefix: "$", value: 20.19, dec: 2, suffix: "M+", label: "paid to builders", accent: "orange" },
  { prefix: "", value: 1.2, dec: 1, suffix: "M+", label: "accounts / wallets", accent: "violet" },
  { prefix: "", value: 4.4, dec: 1, suffix: "M+", label: "agent requests", accent: "orange" },
] as const;

export function LandingHero() {
  const values = useCountUp(STATS.map((s) => s.value), STATS.map((s) => s.dec));

  return (
    <section style={hero}>
      <div style={{ ...eyebrow, color: T.orangeBright }}>
        <span style={dot} aria-hidden />
        ecosystem scale
      </div>

      <h1 style={h1}>
        Look how big <em style={em}>Bankr</em> has become.
      </h1>

      <div style={floatStats}>
        {STATS.map((s, i) => (
          <div key={s.label} style={fstat}>
            <div style={s.accent === "orange" ? numOrange : numViolet}>
              {s.prefix}
              {values[i]}
              {s.suffix}
            </div>
            <div style={fkey}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={scrollCue}>↓ scroll</div>
    </section>
  );
}

function useCountUp(targets: number[], decs: number[]): string[] {
  const [display, setDisplay] = useState<string[]>(targets.map((_, i) => (0).toFixed(decs[i])));

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setDisplay(targets.map((t, i) => t.toFixed(decs[i])));
      return;
    }

    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(targets.map((t, i) => (t * eased).toFixed(decs[i])));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return display;
}

const hero: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "120px 40px 60px",
  position: "relative",
  zIndex: 2,
};

const dot: React.CSSProperties = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: T.orange,
  boxShadow: `0 0 10px ${T.orange}`,
};

const h1: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(44px, 7vw, 86px)",
  lineHeight: 0.98,
  letterSpacing: "-0.035em",
  margin: "24px auto 0",
  maxWidth: "15ch",
  color: T.text,
};

const em: React.CSSProperties = {
  fontStyle: "normal",
  background: `linear-gradient(120deg, ${T.violetBright}, ${T.orangeBright})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const floatStats: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "56px",
  marginTop: "64px",
};

const fstat: React.CSSProperties = { textAlign: "center" };

const numBase: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(38px, 5vw, 60px)",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const numViolet: React.CSSProperties = {
  ...numBase,
  color: T.violetBright,
};

const numOrange: React.CSSProperties = {
  ...numBase,
  color: T.orangeBright,
};

const fkey: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textDim,
  marginTop: "12px",
};

const scrollCue: React.CSSProperties = {
  marginTop: "70px",
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: T.textFaint,
};