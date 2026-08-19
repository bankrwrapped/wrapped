// apps/web/src/components/wrapped/landing/LandingFooter.tsx
//
// Big footer — the braid-termination (locked): leads with the motto as a
// large gradient hero, then a full multi-column layout. Matches the approved
// mockup. Replaces the old tiny copyright-line Footer for the landing.
//
// In the WebGL phase the braid unravels and settles into this layout; here
// it's the flat DOM footer that the braid resolves into.

import { T } from "./tokens";

export function LandingFooter() {
  return (
    <footer style={footer}>
      <div style={footHero}>
        <p style={motto}>You can copy code. You can't copy community.</p>
      </div>

      <div style={grid}>
        <div>
          <div style={brandRow}>
            <img src="/logo.png" alt="Bankr Wrapped" style={brandLogo} />
            <span style={brandName}>Bankr Wrapped</span>
          </div>
          <p style={tag}>
            A year-in-review for everyone who built on Bankr. Community-built, accuracy over
            estimation.
          </p>
        </div>

        <FootCol
          title="Product"
          links={[
            { label: "Generate", href: "/soon" },
            { label: "Leaderboard", href: "#" },
            { label: "The skill", href: "#" },
          ]}
        />
        <FootCol
          title="Links"
          links={[
            { label: "bankr.bot", href: "https://bankr.bot" },
            {
              label: "Explorer",
              href: "https://robinhoodchain.blockscout.com/token/0x00de0f4f3ff55523bec004496bab10cacbfc0ba3",
            },
            { label: "GitHub", href: "https://github.com/bankrwrapped" },
          ]}
        />
        <FootCol
          title="Contact"
          links={[{ label: "@bankrwrapped", href: "https://x.com/bankrwrapped" }]}
        />
      </div>

      <div style={base}>
        <span>© 2026 Bankr Wrapped</span>
        <span>Unofficial community project</span>
      </div>
    </footer>
  );
}

type FootLink = { label: string; href: string };

function FootCol({ title, links }: { title: string; links: FootLink[] }) {
  return (
    <div>
      <h4 style={colTitle}>{title}</h4>
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" style={colLink}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

const footer: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  borderTop: `1px solid ${T.border}`,
  background: "#0a0807",
  padding: "80px 40px 40px",
  marginTop: "60px",
  overflow: "hidden",
};

const footHero: React.CSSProperties = { maxWidth: "1180px", margin: "0 auto 56px", textAlign: "center" };

const motto: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(28px, 4vw, 48px)",
  letterSpacing: "-0.03em",
  lineHeight: 1.05,
  color: T.violetBright,
  maxWidth: "20ch",
  margin: "0 auto",
};

const grid: React.CSSProperties = {
  maxWidth: "1180px",
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
  gap: "40px",
};

const brandRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" };
const brandLogo: React.CSSProperties = { width: "26px", height: "26px", borderRadius: "7px", objectFit: "contain" };
const brandName: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "17px",
  color: T.text,
};

const tag: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "14px",
  color: T.textFaint,
  maxWidth: "34ch",
  lineHeight: 1.5,
};

const colTitle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textFaint,
  marginBottom: "14px",
};

const colLink: React.CSSProperties = {
  display: "block",
  fontFamily: T.fontBody,
  fontSize: "13px",
  color: T.textDim,
  marginBottom: "9px",
  textDecoration: "none",
};

const base: React.CSSProperties = {
  maxWidth: "1180px",
  margin: "56px auto 0",
  paddingTop: "24px",
  borderTop: `1px solid ${T.border}`,
  display: "flex",
  justifyContent: "space-between",
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: T.textFaint,
};