// apps/web/src/components/wrapped/landing/LandingLeaderboard.tsx
//
// Leaderboard teaser — top 5 by earnings, wired to the REAL fetchLeaderboard().
// Real avatars (proxied), volume bars scaled to the leader, #1 accented
// orange. Matches the approved mockup. Fails silent (supporting proof, not
// load-bearing) so a fetch error never blocks the landing.
//
// In the WebGL phase these avatars become billboarded sprites orbiting a
// thick braid segment; here they're the flat DOM teaser.

import { useEffect, useState } from "react";

import { fetchLeaderboard, type LeaderboardEntry } from "@/lib/wrapped-data";
import { T, eyebrow } from "./tokens";

export function LandingLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((rows) => {
        if (!cancelled) setEntries(rows.slice(0, 5));
      })
      .catch(() => {
        /* supporting proof only — silent on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxVol = Math.max(1, ...entries.map((e) => e.totalEarningsEth));

  return (
    <section style={block}>
      <div style={{ ...eyebrow, color: T.violetBright }}>the ledger · refreshed on load</div>
      <h2 style={h2}>Top of the board, right now.</h2>
      <p style={lead}>The wallets moving the most through Bankr. Real data, pulled on load.</p>

      {entries.length > 0 ? (
        <div style={board}>
          {entries.map((e, i) => {
            const pct = Math.round((e.totalEarningsEth / maxVol) * 100);
            const isTop = i === 0;
            return (
              <div key={e.walletAddress} style={row}>
                <span style={rank}>{String(i + 1).padStart(2, "0")}</span>
                {e.avatarUrl ? (
                   <img
                   src={e.avatarUrl}
                   alt=""
                   style={pfp}
                   onError={(ev) => {
                     ev.currentTarget.onerror = null;
                     ev.currentTarget.style.display = "none";
                     ev.currentTarget.insertAdjacentHTML("afterend", '<span data-avatar-fallback style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#2f2440,#160f22);border:1px solid rgba(159,123,255,0.3);display:block"></span>');
                    }}
                  />
                ) : (
                  <span style={pfpFallback} aria-hidden />
                  )}
                <span style={handle}>@{e.username}</span>
                <span style={{ ...vol, color: isTop ? T.orangeBright : T.violetBright }}>
                  {e.totalEarningsEth.toFixed(1)} ETH
                </span>
                <span style={{ ...bar, width: `${pct}%` }} aria-hidden />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...board, padding: "32px", textAlign: "center" }}>
          <span style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.textFaint }}>
            loading the ledger…
          </span>
        </div>
      )}
    </section>
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

const board: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: "18px",
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
  marginTop: "40px",
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px 44px 1fr auto",
  alignItems: "center",
  gap: "16px",
  padding: "16px 22px",
  borderBottom: `1px solid ${T.border}`,
  position: "relative",
};

const rank: React.CSSProperties = { fontFamily: T.fontMono, fontSize: "13px", color: T.textFaint };

const pfp: React.CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "50%",
  objectFit: "cover",
  border: "1px solid rgba(159,123,255,0.3)",
};

const pfpFallback: React.CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, #2f2440, #160f22)",
  border: "1px solid rgba(159,123,255,0.3)",
  display: "block",
};

const handle: React.CSSProperties = { fontFamily: T.fontBody, fontSize: "15px", color: T.text };

const vol: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "14px",
  fontVariantNumeric: "tabular-nums",
};

const bar: React.CSSProperties = {
  position: "absolute",
  left: 0,
  bottom: 0,
  height: "2px",
  background: `linear-gradient(90deg, ${T.violet}, ${T.orange})`,
};