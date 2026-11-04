// apps/web/src/components/wrapped/landing/LandingFooter.tsx
//
// Big footer: the motto, then product, link and contact columns. Shared by
// the landing, the leaderboards and the card wall.

import { Link } from "@tanstack/react-router";
import { useIsMobile } from "./useMediaQuery";
import { T } from "./tokens";

export function LandingFooter() {
  const mobile = useIsMobile();
  return (
    <footer style={footer}>
      <div style={footHero}>
        <p style={motto}>You can copy code. You can't copy community</p>
      </div>

      <div
        style={{
          ...grid,
          gridTemplateColumns: mobile ? "1fr" : "1.4fr 1fr 1fr 1fr",
          gap: mobile ? "32px" : "40px",
        }}
      >
        <div>
          <div style={brandRow}>
            <img src="/logo.png" alt="Bankr Wrapped" style={brandLogo} />
            <span style={brandName}>Bankr Wrapped</span>
          </div>
          <p style={tag}>
            A year-in-review for everyone who built on Bankr. Community-built, accuracy over
            estimation
          </p>
        </div>

        <FootCol
          title="Product"
          links={[
            { label: "Look up a Wrapped", href: "/" },
            { label: "Leaderboards", href: "/leaderboard" },
            { label: "About", href: "/about" },
          ]}
        />
        <FootCol
          title="Links"
          links={[
            { label: "bankr.bot", href: "https://bankr.bot" },
            {
              label: "The skill",
              href: "https://github.com/bankrwrapped/wrapped/tree/main/skills/bankr-wrapped",
            },
            { label: "GitHub", href: "https://github.com/bankrwrapped/wrapped" },
          ]}
        />
        <FootCol
          title="Contact"
          links={[{ label: "@bankrwrapped", href: "https://x.com/bankrwrapped" }]}
          note="Built by the community"
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

function FootCol({ title, links, note }: { title: string; links: FootLink[]; note?: string }) {
  return (
    <div>
      <h4 style={colTitle}>{title}</h4>
      {links.map((l) => {
        // In-app pages go through the router (no full reload); the rest open
        // in a new tab.
        if (l.href.startsWith("/")) {
          return (
            <Link key={l.label} to={l.href} className="foot-link" style={colLink}>
              {l.label}
            </Link>
          );
        }
        return (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="foot-link"
            style={colLink}
          >
            {l.label}
          </a>
        );
      })}
      {note ? <p style={{ ...colLink, margin: 0 }}>{note}</p> : null}
    </div>
  );
}

const footer: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  borderTop: `1px solid ${T.border}`,
  background: T.deep,
  padding: "64px clamp(20px, 4vw, 64px) 40px",
  marginTop: "64px",
};

const footHero: React.CSSProperties = { margin: "0 0 64px", textAlign: "center" };

const motto: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 400,
  fontSize: "clamp(32px, 4vw, 48px)",
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  color: T.text,
  maxWidth: "20ch",
  margin: "0 auto",
};

const grid: React.CSSProperties = {
  display: "grid",
};

const brandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
};
const brandLogo: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "6px",
  objectFit: "contain",
};
const brandName: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontWeight: 500,
  fontSize: "16px",
  color: T.text,
};

const tag: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "14px",
  lineHeight: "20px",
  color: T.textDim,
  maxWidth: "34ch",
  margin: 0,
};

const colTitle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: 400,
  color: T.textFaint,
  margin: "0 0 12px",
};

const colLink: React.CSSProperties = {
  display: "block",
  fontFamily: T.fontBody,
  fontSize: "14px",
  lineHeight: "20px",
  color: T.textDim,
  marginBottom: "8px",
  textDecoration: "none",
};

const base: React.CSSProperties = {
  margin: "48px 0 0",
  paddingTop: "24px",
  borderTop: `1px solid ${T.border}`,
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
};
