// apps/web/src/components/wrapped/landing/LandingThesis.tsx
//
// Thesis — three beats, alternating L/R/L on desktop, SINGLE-COLUMN on
// mobile (number above title, everything left-aligned, no cramped grid).
// Scroll-revealed, replaying each entry. Ghost numbers now BRIGHT (0.55 +
// glow), orange on beat 02.

import { Reveal } from "./Reveal";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow } from "./tokens";

const BEATS = [
  { n: "01", title: "Build", body: "Ship the thing. No pitch deck, no permission, no waiting room.", side: "left" as const },
  { n: "02", title: "Tokenize", body: "Turn it into something your people can actually hold a stake in.", side: "right" as const },
  { n: "03", title: "Let your community decide", body: "The market that matters is the one already paying attention.", side: "left" as const },
];

export function LandingThesis() {
  const mobile = useIsMobile();
  return (
    <section style={block(mobile)}>
      <Reveal from="up">
        <div style={{ ...eyebrow, color: T.violetBright }}>the thesis</div>
        <h2 style={h2(mobile)}>What actually happens on Bankr.</h2>
        <p style={lead}>
          Build something. Turn it into a token. Let the people already paying attention decide
          what it's worth.
        </p>
      </Reveal>

      <div style={{ marginTop: "24px" }}>
        {BEATS.map((b) => (
          <Beat key={b.n} beat={b} mobile={mobile} />
        ))}
      </div>
    </section>
  );
}

function Beat({ beat, mobile }: { beat: (typeof BEATS)[number]; mobile: boolean }) {
  const isRight = beat.side === "right";
  const isOrange = beat.n === "02";
  const ghostColor = isOrange ? "rgba(255,122,26,0.6)" : "rgba(159,123,255,0.6)";
  const glow = isOrange ? "rgba(255,122,26,0.4)" : "rgba(159,123,255,0.4)";

  const numEl = (
    <div
      style={{
        ...ghostNum(mobile),
        color: ghostColor,
        textShadow: `0 0 40px ${glow}`,
        textAlign: mobile ? "left" : isRight ? "right" : "left",
      }}
    >
      {beat.n}
    </div>
  );
  const bodyEl = (
    <div style={{ textAlign: mobile ? "left" : isRight ? "right" : "left" }}>
      <h3 style={beatTitle}>{beat.title}</h3>
      <p style={{ ...beatBody, marginLeft: !mobile && isRight ? "auto" : 0 }}>{beat.body}</p>
    </div>
  );

  // Mobile: always number-on-top, single column, left aligned.
  if (mobile) {
    return (
      <Reveal from="up" amount={0.3}>
        <div style={beatRowMobile}>
          {numEl}
          {bodyEl}
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal from={isRight ? "right" : "left"} amount={0.4}>
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
    </Reveal>
  );
}

const block = (m: boolean): React.CSSProperties => ({
  padding: m ? "80px 0" : "120px 0",
  position: "relative",
  zIndex: 2,
  maxWidth: "1180px",
  margin: "0 auto",
});

const h2 = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: m ? "clamp(26px, 8vw, 38px)" : "clamp(30px, 4.5vw, 52px)",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  margin: "16px 0 22px",
  color: T.text,
});

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

const beatRowMobile: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  margin: "40px 0",
};

const ghostNum = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: m ? "72px" : "120px",
  lineHeight: 0.8,
  letterSpacing: "-0.04em",
});

const beatTitle: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "28px",
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