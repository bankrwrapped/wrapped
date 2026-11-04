// Handle lookup: the way into a Wrapped. Type an X handle, pick a suggestion
// (from /api/search, Bankr's user search) or press Enter, and the Wrapped
// opens at /?u=<handle>. Wrapped is built from public on-chain data, so
// there's no sign-in.
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { normalizeHandle, searchHandles, type SearchSuggestion } from "@/lib/wrapped-data";
import { T } from "./tokens";

export function Lookup({
  id,
  autoFocus,
  size = "lg",
}: {
  id?: string;
  autoFocus?: boolean;
  size?: "lg" | "md";
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const wrap = useRef<HTMLFormElement | null>(null);

  // Suggestions, debounced; a slower earlier response never overwrites a newer one.
  useEffect(() => {
    const q = normalizeHandle(query);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      searchHandles(q).then((r) => {
        if (n !== seq.current) return;
        // One row per handle; Bankr can return the same name on X and Farcaster.
        const seen = new Set<string>();
        setResults(
          r
            .filter(
              (s) => !seen.has(s.username.toLowerCase()) && seen.add(s.username.toLowerCase()),
            )
            .slice(0, 6),
        );
        setActive(-1);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (raw: string) => {
    const u = normalizeHandle(raw);
    if (!u) return;
    setOpen(false);
    void navigate({ to: "/", search: { u } });
    window.scrollTo(0, 0);
  };

  const showList = open && results.length > 0;
  const h = size === "lg" ? 48 : 44;

  return (
    <form
      ref={wrap}
      role="search"
      style={{ position: "relative", width: "100%" }}
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 && results[active] ? results[active].username : query);
      }}
    >
      <div style={{ display: "flex", gap: "8px" }}>
        <label style={{ ...field, height: h }} className="lookup-field">
          <Search
            size={18}
            strokeWidth={1.5}
            color={T.textFaint}
            aria-hidden
            style={{ flex: "none" }}
          />
          <span style={at} aria-hidden>
            @
          </span>
          <input
            id={id}
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && results.length) {
                e.preventDefault();
                setOpen(true);
                setActive((a) => (a + 1) % results.length);
              } else if (e.key === "ArrowUp" && results.length) {
                e.preventDefault();
                setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="x handle"
            aria-label="X handle"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            style={input}
          />
        </label>
        <button
          type="submit"
          className="btn-primary"
          style={{ ...submit, height: h }}
          disabled={!normalizeHandle(query)}
        >
          See Wrapped
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      {showList ? (
        <ul id={listId} role="listbox" style={list}>
          {results.map((r, i) => (
            <li
              key={`${r.platform}:${r.username}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r.username);
              }}
              onMouseEnter={() => setActive(i)}
              style={{ ...option, background: i === active ? T.raised : "transparent" }}
            >
              {r.profileImageUrl ? (
                <img src={r.profileImageUrl} alt="" style={avatar} />
              ) : (
                <span style={{ ...avatar, background: T.raised }} />
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                @{r.username}
              </span>
              <span style={platform}>{r.platform === "twitter" ? "X" : "Farcaster"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

const field: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "0 16px",
  borderRadius: "10px",
  border: `1px solid ${T.borderStrong}`,
  background: T.deep,
  cursor: "text",
};

const at: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "15px",
  color: T.textFaint,
  marginRight: "-4px",
};

const input: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: T.fontMono,
  fontSize: "15px",
  color: T.text,
};

const submit: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "0 20px",
  borderRadius: "10px",
  border: "none",
  background: T.text,
  color: T.ink,
  fontFamily: T.fontBody,
  fontWeight: 500,
  fontSize: "15px",
  cursor: "pointer",
  flex: "none",
  whiteSpace: "nowrap",
};

const list: React.CSSProperties = {
  position: "absolute",
  zIndex: 30,
  top: "calc(100% + 8px)",
  left: 0,
  right: 0,
  margin: 0,
  padding: "4px",
  listStyle: "none",
  borderRadius: "12px",
  border: `1px solid ${T.border}`,
  background: T.card,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const option: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  height: "44px",
  padding: "0 12px",
  borderRadius: "8px",
  cursor: "pointer",
  fontFamily: T.fontBody,
  fontSize: "15px",
  color: T.text,
};

const avatar: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  objectFit: "cover",
  flex: "none",
};
const platform: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  color: T.textFaint,
  flex: "none",
};
