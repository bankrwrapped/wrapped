// apps/web/src/components/wrapped/landing/LandingThesis.tsx
//
// Thesis section — three beats in an alternating left/right/left arrangement
// with oversized ghost numbers (violet on left beats, orange on right).
// Matches the approved mockup. Copy is placeholder-quality for now — the
// real generative thesis copy is a later pass, but the arrangement is final.
//
// In the eventual WebGL phase these three become scroll-scrubbed braid
// segments; here they're the flat DOM representation that layers over the
// braid.

import { T, eyebrow } from "./tokens";

const BEATS = [
  {
    n: "01",
    title: "Build",
    body: "Ship the thing. No pitch deck, no permission, no waiting room.",
    side: "left" as const,
  },
  {
    n: "02",
    title: "Tokenize",
    body: "Turn it into something your people can actually hold a stake in.",
    side: "right" as const,
  },
  {
    n: "03",
    title: "Let your community decide",
    body: "The market that matters is the one already paying attention.",
    side: "left" as const,
  },
];

export function LandingThesis() {
  return (
    <section style={block}>
      <div style={{ ...eyebrow, color: T.violetBright }}>the thesis</div>
      <h2 style={h2}>What actually happens on Bankr.</h2>
      <p style={lead}>
        Build something. Turn it into a token. Let the people already paying attention decide
        what it's worth.
      </p>

      <div style={{ marginTop: "24px" }}>
        {BEATS.map((b) => (
          <Beat key={b.n} beat={b} />
        ))}
      </div>
    </section>
  );
}

function Beat({ beat }: { beat: (typeof BEATS)[number] }) {
  const isRight = beat.side === "right";
  const ghostColor = isRight ? "rgba(255,122,26,0.16)" : "rgba(159,123,255,0.16)";

  const numEl = (
    <div style={{ ...ghostNum, color: ghostColor, textAlign: isRight ? "right" : "left" }}>
      {beat.n}
    </div>
  );
  const bodyEl = (
    <div style={{ textAlign: isRight ? "right" : "left" }}>
      <h3 style={beatTitle}>{beat.title}</h3>
      <p style={{ ...beatBody, marginLeft: isRight ? "auto" : 0 }}>{beat.body}</p>
    </div>
  );

  return (
    <div style={beatRow}>
      {isRight ? (
        <>
          {bodyEl}
          {numEl}
        </>
      ) : (
        <>
          {numEl}
          {bodyEl}
        </>
      )}
    </div>
  );
}

const block: React.CSSProperties = {
  padding: "120px 0",
  position: "relative",
  zIndex: 2,
  maxWidth: "1180px",
  margin: "0 auto",
};

const h2: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(30px, 4.5vw, 52px)",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  margin: "16px 0 22px",
  color: T.text,
};

const lead: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "17px",
  lineHeight: 1.55,
  color: T.textDim,
  maxWidth: "46ch",
};

const beatRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "40px",
  alignItems: "center",
  margin: "56px 0",
};

const ghostNum: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "120px",
  lineHeight: 0.8,
  letterSpacing: "-0.04em",
};

const beatTitle: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "32px",
  letterSpacing: "-0.02em",
  marginBottom: "12px",
  color: T.text,
};

const beatBody: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "16px",
  lineHeight: 1.55,
  color: T.textDim,
  maxWidth: "40ch",
  margin: 0,
};