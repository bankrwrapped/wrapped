// apps/web/src/components/wrapped/landing/LandingHeader.tsx
//
// Fixed site header: logo + wordmark, About and Built-by dropdowns as quiet
// text buttons, one "Look up" button that jumps to the hero's handle field.

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useIsMobile } from "./useMediaQuery";
import { T } from "./tokens";

const BUILDERS = [
  { name: "Kabeer", handle: "basedkabeer" },
  { name: "CMG", handle: "01CryptoGen" },
] as const;

export function LandingHeader() {
  const mobile = useIsMobile();
  const [open, setOpen] = useState<"about" | "built" | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const lookUp = () => {
    const input = document.getElementById("lookup-input") as HTMLInputElement | null;
    if (!input) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    input.focus({ preventScroll: true });
  };

  return (
    <header style={header}>
      <div style={logo}>
        <img src="/logo.png" alt="Bankr Wrapped" style={mark} />
        <span style={logoText}>Bankr Wrapped</span>
      </div>
      <nav ref={navRef} style={nav}>
        {!mobile ? (
          <Dropdown
            label="About"
            isOpen={open === "about"}
            onToggle={() => setOpen((o) => (o === "about" ? null : "about"))}
          >
            <p style={dropText}>
              A year-in-review for everyone who built on Bankr this year. We read the on-chain
              record and hand it back to you. Community-built, accuracy over estimation.
            </p>
          </Dropdown>
        ) : null}

        {!mobile ? (
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
        ) : null}

        <button type="button" onClick={lookUp} className="btn-primary" style={pillPrimary}>
          Look up
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
        className="btn-quiet"
        style={pill}
        aria-expanded={isOpen}
      >
        {label}
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          style={{
            transform: isOpen ? "rotate(180deg)" : undefined,
            transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
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
  height: "64px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 clamp(20px, 4vw, 64px)",
  background: "rgba(20,20,21,0.88)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderBottom: `1px solid ${T.border}`,
  fontFamily: T.fontBody,
  fontSize: "14px",
};

const logo: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
const mark: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  display: "block",
  objectFit: "contain",
};
const logoText: React.CSSProperties = {
  color: T.text,
  fontWeight: 500,
  fontSize: "16px",
  whiteSpace: "nowrap",
};

const nav: React.CSSProperties = { display: "flex", alignItems: "center", gap: "4px" };

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  height: "36px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "none",
  color: T.textDim,
  fontFamily: "inherit",
  fontSize: "inherit",
  cursor: "pointer",
  background: "transparent",
};

const pillPrimary: React.CSSProperties = {
  ...pill,
  marginLeft: "8px",
  padding: "0 16px",
  background: T.text,
  color: T.ink,
  fontWeight: 500,
};

const dropdown: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: "300px",
  padding: "16px",
  textAlign: "left",
  border: `1px solid ${T.border}`,
  borderRadius: "12px",
  background: T.card,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const dropText: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "14px",
  lineHeight: "20px",
  color: T.textDim,
  margin: 0,
};

const builderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px",
  borderRadius: "8px",
  fontFamily: T.fontBody,
  fontSize: "14px",
  color: T.text,
  textDecoration: "none",
};
