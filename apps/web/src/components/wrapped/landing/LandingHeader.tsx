// apps/web/src/components/wrapped/landing/LandingHeader.tsx
//
// Fixed site header. Paired Bankr + $BNW logo marks + wordmark, About and
// Built-by dropdowns, Connect X. Matches the approved landing mockup.
//
// Logo marks are gradient placeholders here (same as the mockup) — swap to
// real <img> from /public once the final marks are dropped in. Connect X
// scrolls to the merged sign-in block (built in a later chunk); until that
// section exists it falls back to firing OAuth directly.

import { useEffect, useRef, useState } from "react";

import { T } from "./tokens";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const OAUTH_START_URL = `${API_URL}/api/auth/x/start`;

const BUILDERS = [
  { name: "Kabeer", handle: "basedkabeer" },
  { name: "CMG", handle: "01CryptoGen" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState<"about" | "built" | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const connect = () => {
    window.location.assign("/soon");
  };

  return (
    <header style={header}>
      <div style={logo}>
        <img src="/logo.png" alt="Bankr Wrapped" style={mark} />
        <span style={logoText}>Bankr Wrapped</span>
      </div>

      <nav ref={navRef} style={nav}>
        <Dropdown
          label="About"
          isOpen={open === "about"}
          onToggle={() => setOpen((o) => (o === "about" ? null : "about"))}
        >
          <p style={dropText}>
            A year-in-review for everyone who built on Bankr this year. We read the on-chain
            record and hand it back to you — community-built, accuracy over estimation.
          </p>
        </Dropdown>

        <Dropdown
          label="Built by"
          isOpen={open === "built"}
          onToggle={() => setOpen((o) => (o === "built" ? null : "built"))}
        >
          {BUILDERS.map((b) => (
            <a
              key={b.handle}
              href={`https://x.com/${b.handle}`}
              target="_blank"
              rel="noreferrer"
              style={builderRow}
            >
              <span>{b.name}</span>
              <span style={{ color: T.textFaint }}>@{b.handle}</span>
            </a>
          ))}
        </Dropdown>

        <button type="button" onClick={connect} style={pillPrimary}>
          Connect X
        </button>
      </nav>
    </header>
  );
}

function Dropdown({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onToggle}
        style={pill}
        aria-expanded={isOpen}
      >
        {label} ▾
      </button>
      {isOpen ? <div style={dropdown}>{children}</div> : null}
    </div>
  );
}

const header: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 40px",
  background: "rgba(12,10,9,0.7)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderBottom: `1px solid ${T.border}`,
  fontFamily: T.fontMono,
  fontSize: "11px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const logo: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px" };
const mark: React.CSSProperties = { width: "28px", height: "28px", borderRadius: "7px", display: "block", objectFit: "contain" };
const logoText: React.CSSProperties = { color: "#c9c2b8", whiteSpace: "nowrap" };

const nav: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px" };

const pill: React.CSSProperties = {
  padding: "8px 15px",
  borderRadius: "999px",
  border: `1px solid ${T.borderStrong}`,
  color: T.textDim,
  fontFamily: "inherit",
  fontSize: "inherit",
  letterSpacing: "inherit",
  textTransform: "inherit",
  cursor: "pointer",
  background: "transparent",
};

const pillPrimary: React.CSSProperties = {
  ...pill,
  background: "linear-gradient(180deg, rgba(159,123,255,0.16), transparent)",
  borderColor: "rgba(159,123,255,0.3)",
  color: T.violetBright,
};

const dropdown: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 10px)",
  right: 0,
  width: "300px",
  padding: "16px 18px",
  textAlign: "left",
  textTransform: "none",
  letterSpacing: "normal",
  border: `1px solid ${T.border}`,
  borderRadius: "14px",
  background: "linear-gradient(180deg, rgba(20,16,24,0.98), rgba(12,10,9,0.98))",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 20px 50px -20px rgba(0,0,0,0.7)",
};

const dropText: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "13px",
  lineHeight: 1.6,
  color: T.textDim,
  margin: 0,
};

const builderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "9px 8px",
  borderRadius: "8px",
  fontFamily: T.fontBody,
  fontSize: "12.5px",
  color: T.text,
  textDecoration: "none",
};