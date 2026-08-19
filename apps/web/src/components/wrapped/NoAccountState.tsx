import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";

const TEASER_ITEMS = [
  { emoji: "\u{1F4B0}", label: "Total earned" },
  { emoji: "\u{1F680}", label: "Tokens launched" },
  { emoji: "\u{1F91D}", label: "Please Bro tokens" },
  { emoji: "\u{1F4C8}", label: "Your earning journey" },
];

type Props = {
  onBack: () => void;
};

export function NoAccountState({ onBack }: Props) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
      <Backdrop />

      <div className="relative z-10 w-full max-w-lg space-y-7 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 120, damping: 16 }}
          className="space-y-3"
        >
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
            This story{" "}
            <span className="text-gradient">doesn&rsquo;t exist</span> on Bankr
            yet.
          </h1>
          <p className="text-base text-muted-foreground">
            No account, no earnings, no tokens &mdash; but every builder on
            Bankr started exactly where you are right now.
          </p>
        </motion.div>

        {/* Locked preview - the actual shape of what a real Wrapped looks
            like, blurred/dimmed, so the value is visible even though it's
            inaccessible. Real FOMO comes from seeing the thing you can't
            have yet, not being told about it in the abstract. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.12 }}
          className="glass relative overflow-hidden rounded-3xl p-6"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            What your Wrapped could show
          </p>
          <div className="grid grid-cols-2 gap-3">
            {TEASER_ITEMS.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left blur-[2px] opacity-60"
              >
                <span className="text-xl">{item.emoji}</span>
                <p className="mt-2 font-display text-lg font-extrabold">???</p>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.24 }}
          className="space-y-3"
        >
          <a href="https://bankr.bot" target="_blank" rel="noreferrer" className="block">
            <Button variant="hero" size="xl" className="w-full">
              Create a Bankr Account
            </Button>
          </a>
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
