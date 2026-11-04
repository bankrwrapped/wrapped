// apps/web/src/components/wrapped/landing/LandingLeaderboard.tsx
//
// Leaderboard teaser: top 5 by earnings, wired to real fetchLeaderboard().
// A thin bar under each row shows its share of the leader's total; the
// leader gets the accent. Fails silent (supporting proof). Real avatars used
// directly (display context), with an onError fallback.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { fetchLeaderboard, type LeaderboardEntry } from "@/lib/wrapped-data";
import { Reveal } from "./Reveal";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow, h2Style, leadStyle, panel, sectionStyle } from "./tokens";

export function LandingLeaderboard() {
  const mobile = useIsMobile();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((rows) => {
        if (!cancelled) setEntries(rows.slice(0, 5));
      })
      .catch(() => {
        /* supporting proof only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxVol = Math.max(1, ...entries.map((e) => e.totalEarningsEth));

  return (
    <section style={sectionStyle(mobile)}>
      <Reveal from="up">
        <div style={eyebrow}>Leaderboard</div>
        <h2 style={h2Style(mobile)}>Top of the board right now</h2>
        <p style={leadStyle}>
          The builders who've earned the most from their launches, pulled live on every visit.
        </p>
      </Reveal>

      {entries.length > 0 ? (
        <ol style={board}>
          {entries.map((e, i) => {
            const share = e.totalEarningsEth / maxVol;
            const isTop = i === 0;
            return (
              <motion.li
                key={e.walletAddress}
                style={{
                  ...row,
                  borderBottom: i === entries.length - 1 ? "none" : row.borderBottom,
                }}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              >
                <span style={rank}>{i + 1}</span>
                {e.avatarUrl ? (
                  <img
                    src={e.avatarUrl}
                    alt=""
                    style={pfp}
                    onError={(ev) => {
                      ev.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span style={pfpFallback} aria-hidden />
                )}
                <span style={handle}>@{e.username}</span>
                <span style={{ ...vol, color: isTop ? T.accent : T.text }}>
                  {e.totalEarningsEth.toFixed(3)} ETH
                </span>
                <span aria-hidden style={track}>
                  <motion.span
                    style={{ ...bar, background: isTop ? T.accent : "rgba(237,237,237,0.24)" }}
                    initial={reduce ? false : { scaleX: 0 }}
                    whileInView={reduce ? undefined : { scaleX: share }}
                    animate={reduce ? { scaleX: share } : undefined}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.5, delay: i * 0.05 + 0.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
              </motion.li>
            );
          })}
        </ol>
      ) : (
        <div style={{ ...board, padding: "32px", textAlign: "center" }}>
          <span style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.textFaint }}>
            Loading the board…
          </span>
        </div>
      )}
    </section>
  );
}

const board: React.CSSProperties = {
  ...panel,
  listStyle: "none",
  padding: 0,
  overflow: "hidden",
  margin: "40px 0 0",
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 32px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "16px",
  padding: "16px 24px 20px",
  borderBottom: `1px solid ${T.border}`,
  position: "relative",
};

const rank: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "13px",
  color: T.textFaint,
  fontVariantNumeric: "tabular-nums",
};

const pfp: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  objectFit: "cover",
};
const pfpFallback: React.CSSProperties = { ...pfp, background: T.raised, display: "block" };

const handle: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "15px",
  color: T.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const vol: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "14px",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

// Sits under the handle column and runs to the right edge.
const track: React.CSSProperties = {
  position: "absolute",
  left: "112px",
  right: "24px",
  bottom: "8px",
  height: "2px",
  borderRadius: "2px",
  background: "rgba(237,237,237,0.06)",
  overflow: "hidden",
};

const bar: React.CSSProperties = {
  display: "block",
  height: "100%",
  transformOrigin: "left center",
};
