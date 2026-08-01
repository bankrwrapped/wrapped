import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LiquidGlassBackdrop } from "@/components/wrapped/LiquidGlassBackdrop";

type Step = { emoji: string; title: string; body: string };

const STEPS: Step[] = [
  {
    emoji: "\u{1F680}",
    title: "Launch a token",
    body: "The fastest way to a real Wrapped. Deploy through Bankr and start earning creator fees immediately.",
  },
  {
    emoji: "\u{1F91D}",
    title: "Get a Please Bro token",
    body: "Have someone redirect their creator fees to you. It counts just as much as launching your own.",
  },
  {
    emoji: "\u{1F4C8}",
    title: "Trade on-chain",
    body: "Use Bankr for on-chain activity to build your trading performance.",
  },
  {
    emoji: "\u{1FA99}",
    title: "Hold BNKR",
    body: "Keep BNKR in your linked wallet to grow your BNKR score.",
  },
];

type Props = {
  onBack: () => void;
};

export function NoActivityState({ onBack }: Props) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
      <LiquidGlassBackdrop />

      <div className="relative z-10 w-full max-w-lg space-y-7 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 120, damping: 16 }}
          className="space-y-3"
        >
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
            You&rsquo;re on Bankr &mdash;{" "}
            <span className="text-gradient">your story&rsquo;s just getting started.</span>
          </h1>
          <p className="text-base text-muted-foreground">
            You've got an account, you just haven't made a move yet. One
            launch or one Please Bro token away from your first real Wrapped.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.12 }}
          className="glass relative space-y-0 overflow-hidden rounded-3xl p-2 text-left"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className={
                "flex items-start gap-3 rounded-2xl p-4" +
                (i === 0 ? " border border-accent/30 bg-accent/5" : "")
              }
            >
              <span className="text-2xl leading-none">{step.emoji}</span>
              <div>
                <p className="font-semibold">
                  {step.title}
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Fastest
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.24 }}
          className="space-y-3"
        >
          <a href="https://bankr.bot" target="_blank" rel="noreferrer" className="block">
            <Button variant="hero" size="xl" className="w-full">
              Launch Your First Token
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            Ask the Bankr bot for your latest scores anytime.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="glass mx-auto flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Search another handle
          </button>
        </motion.div>
      </div>
    </main>
  );
}
