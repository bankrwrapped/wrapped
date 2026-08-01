import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { WrappedProfile } from "@/lib/wrapped-data";

type Props = {
  profile: WrappedProfile;
  onDone: () => void;
};

// Brief "building your wrapped" beat that shows the found profile's pfp,
// then reveals that there's no activity yet, before handing off to the
// full State 1 screen. Tap anywhere to skip ahead.
export function SceneNoActivityReveal({ profile, onDone }: Props) {
  const [stage, setStage] = useState<"building" | "notice">("building");

  useEffect(() => {
    const toNotice = setTimeout(() => setStage("notice"), 1600);
    const toDone = setTimeout(() => onDone(), 3200);
    return () => {
      clearTimeout(toNotice);
      clearTimeout(toDone);
    };
  }, [onDone]);

  return (
    <main
      className="relative flex min-h-screen cursor-pointer flex-col items-center justify-center overflow-hidden px-5 text-center"
      onClick={onDone}
    >
      <img
        src="/liquid-glass-bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/85 via-background/65 to-background/90" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/15" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        className="absolute left-5 top-5 z-20 flex items-center gap-2.5"
      >
        <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
        </div>
        <span className="font-display text-sm font-bold tracking-tight">
          Bankr <span className="text-gradient">Wrapped</span>
        </span>
      </motion.div>

      <div className="relative z-10 space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 14 }}
          className="relative mx-auto size-24"
        >
          <div className="absolute inset-0 animate-glow-pulse rounded-full bg-primary/40 blur-xl" />
          <img
            src={profile.avatar}
            alt={profile.handle}
            className="glass relative size-24 rounded-full object-cover"
          />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-lg text-muted-foreground"
        >
          @{profile.handle}
        </motion.p>

        <AnimatePresence mode="wait">
          <motion.p
            key={stage}
            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 130, damping: 16 }}
            className="font-display text-2xl font-bold"
          >
            {stage === "building" ? "Building your Bankr Wrapped…" : "No activity found yet."}
          </motion.p>
        </AnimatePresence>
      </div>
    </main>
  );
}
