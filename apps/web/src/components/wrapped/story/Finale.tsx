// The end of the story: the year in four numbers, then every share card
// flying in from a stack and settling into a staggered wall (alternate
// columns sit lower). Tapping a card opens it full size with its share
// actions; arrows step through the set.
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, Trophy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/story-data";
import { proxiedImageUrl } from "@/lib/wrapped-data";
import { ScaledCard, ShareActions } from "../cards/ShareableCard";
import { CARDS, CardFace, type CardContext } from "../cards/WrappedCards";
import { Backdrop, COLORS, CountUp, EASE, FadeUp, Words } from "./motion";

function useColumns(): number {
  const query = () => (window.matchMedia("(min-width: 1024px)").matches ? 4 : window.matchMedia("(min-width: 640px)").matches ? 3 : 2);
  const [cols, setCols] = useState(() => (typeof window === "undefined" ? 2 : query()));
  useEffect(() => {
    const onResize = () => setCols(query());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return cols;
}

export function Finale({ ctx, onReplay, notices }: { ctx: CardContext; onReplay: () => void; notices: string[] }) {
  const p = ctx.profile;
  const reduce = useReducedMotion();
  const cards = CARDS.filter((c) => c.available(ctx));
  const cols = useColumns();
  // The open card is tracked by id: the list is rebuilt from the live profile,
  // so a background update (volume landing) can shift positions under it.
  const [openId, setOpenId] = useState<string | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);
  const v = p.tradingVolume;

  const stats = [
    { label: "Tokens launched", value: p.tokensLaunched, format: (n: number) => String(Math.round(n)) },
    { label: "ETH earned", value: p.totalEth, format: (n: number) => n.toFixed(3), prefix: p.earningsPartial ? "≥ " : "" },
    v.status === "ok" && v.totalVolumeUsd > 0
      ? { label: v.isComplete ? "Trading volume" : "Volume so far", value: v.totalVolumeUsd, format: formatUsd }
      : { label: "Trading volume", text: v.status === "pending" ? "Counting…" : v.status === "ok" ? "$0" : "—" },
    p.bestDay ? { label: "Best day, ETH", value: p.bestDay.eth, format: (n: number) => n.toFixed(3) } : { label: "Please Bro tokens", value: p.pleaseBro.length, format: (n: number) => String(Math.round(n)) },
  ];

  const openAt = openId === null ? -1 : cards.findIndex((c) => c.id === openId);
  const def = openAt >= 0 ? cards[openAt] : null;
  const step = (d: number) => {
    if (openAt >= 0) setOpenId(cards[(openAt + d + cards.length) % cards.length].id);
  };

  return (
    <main className="relative min-h-screen overflow-hidden pb-24 text-white">
      <div className="fixed inset-0">
        <Backdrop palette={[COLORS.violet, COLORS.ember, COLORS.indigo]} intensity={0.35} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-10 sm:px-8 sm:pt-14">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            {p.avatar && <img src={proxiedImageUrl(p.avatar)} alt="" className="size-16 rounded-full object-cover ring-2 ring-white/25 sm:size-20" />}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/60">
                Bankr Wrapped · {new Date().getUTCFullYear()}
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-6xl">
                <Words text={`@${p.handle}`} delay={0.1} />
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReplay}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
            >
              <RotateCcw className="size-4" /> Replay story
            </button>
            <Link to="/leaderboard" className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
              <Trophy className="size-4" /> Leaderboards
            </Link>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/12 bg-white/12 sm:grid-cols-4">
          {stats.map((s, i) => (
            <FadeUp key={s.label} delay={0.2 + i * 0.08} y={12} className="bg-[#0d0b12]/85 px-5 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">{s.label}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                {"text" in s ? (
                  <span className="text-white/60">{s.text}</span>
                ) : (
                  <>
                    {s.prefix}
                    <CountUp value={s.value} format={s.format} delay={0.3 + i * 0.08} duration={1400} className={i === 1 ? "text-gradient" : undefined} />
                  </>
                )}
              </p>
            </FadeUp>
          ))}
        </div>

        {notices.map((n) => (
          <p key={n} role="status" className="mt-4 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white/70">
            {n}
          </p>
        ))}

        <div className="mb-6 mt-14 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-3xl font-extrabold">Your cards</h2>
          <p className="font-mono text-xs text-white/55">Tap a card to post, copy or save it</p>
        </div>

        <ul className="grid gap-4 sm:gap-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, paddingBottom: 48 }}>
          {cards.map((c, i) => {
            const offset = (i % cols) % 2 === 1 ? 48 : 0;
            const tilt = [-6, 5, -4, 7, -5, 4][i % 6];
            return (
              <motion.li
                key={c.id}
                initial={reduce ? { opacity: 0, y: offset } : { opacity: 0, y: 260, x: (cols / 2 - (i % cols) - 0.5) * 120, rotate: tilt * 2, scale: 0.7 }}
                animate={{ opacity: 1, y: offset, x: 0, rotate: 0, scale: 1 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.5 + i * 0.07 }}
                whileHover={reduce ? undefined : { y: offset - 10, rotate: tilt / 4, transition: { duration: 0.25 } }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="block w-full rounded-[22px] text-left shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] outline-none ring-accent ring-offset-2 ring-offset-[#0b0910] focus-visible:ring-2"
                  aria-label={`Open the ${c.eyebrow} card`}
                >
                  <ScaledCard>
                    <CardFace def={c} ctx={ctx} />
                  </ScaledCard>
                </button>
              </motion.li>
            );
          })}
        </ul>

        <section className="mt-16 rounded-3xl border border-white/12 bg-white/[0.04] p-6 text-center sm:p-10">
          <p className="font-display text-3xl font-extrabold">What&rsquo;s next?</p>
          <p className="mt-2 text-white/70">Every launch adds to next year&rsquo;s Wrapped.</p>
          <div className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            <a href="https://bankr.bot" target="_blank" rel="noopener noreferrer" className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground">
              Launch your next token
            </a>
            <Link to="/leaderboard" className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15">
              See all leaderboards
            </Link>
          </div>
          <p className="mt-4 font-mono text-xs text-white/50">Or ask the bot: &ldquo;@bankrbot show me my Bankr Wrapped&rdquo;</p>
        </section>
      </div>

      <Dialog.Root open={def !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md" />
          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-4 py-6 outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") step(1);
              if (e.key === "ArrowLeft") step(-1);
            }}
            onClick={(e) => e.target === e.currentTarget && setOpenId(null)}
          >
            {def && (
              <>
                <Dialog.Title className="sr-only">{def.eyebrow}</Dialog.Title>
                <Dialog.Description className="sr-only">Share this card on X, copy it, or save the image.</Dialog.Description>
                <motion.div
                  key={def.id}
                  className="w-[min(420px,calc(100vw-2rem),calc((100dvh-11rem)*0.8))]"
                  initial={{ opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <ScaledCard>
                    <CardFace def={def} ctx={ctx} faceRef={faceRef} />
                  </ScaledCard>
                </motion.div>
                <div className="flex w-[min(420px,calc(100vw-2rem))] items-start gap-2">
                  <button type="button" onClick={() => step(-1)} aria-label="Previous card" className="rounded-full bg-white/10 p-2.5 hover:bg-white/15">
                    <ChevronLeft className="size-4" />
                  </button>
                  <ShareActions faceRef={faceRef} id={def.id} handle={p.handle} shareText={def.shareText(ctx)} />
                  <button type="button" onClick={() => step(1)} aria-label="Next card" className="rounded-full bg-white/10 p-2.5 hover:bg-white/15">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <Dialog.Close className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 hover:bg-white/15" aria-label="Close">
                  <X className="size-4" />
                </Dialog.Close>
                <p className="font-mono text-[11px] text-white/50">
                  {openAt + 1} / {cards.length}
                </p>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

