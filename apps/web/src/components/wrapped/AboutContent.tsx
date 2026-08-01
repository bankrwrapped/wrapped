import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

const WHY_COPY = [
  "Every builder on Bankr is writing their own story \u2014 one launch, one Please Bro token, one claim at a time. Most of it lives buried in transaction logs nobody ever reads.",
  "Bankr Wrapped exists to change that. Every builder deserves a moment to actually see what they built \u2014 not as a spreadsheet, but as something worth screenshotting, sharing, and being proud of.",
  "This is a love letter to the Bankr community, built by two people who believe builders deserve to see their own receipts.",
];

const BUILDERS = [
  { name: "Kabeer", handle: "basedkabeer" },
  { name: "01CryptoGen", handle: "01CryptoGen" },
];

export function AboutContent() {
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 130, damping: 16 }}
        className="glass relative overflow-hidden rounded-3xl p-6"
      >
        <div className="animate-sweep pointer-events-none absolute inset-0" />
        <h1 className="mb-3 font-display text-2xl font-extrabold sm:text-3xl">
          Why <span className="text-gradient">Bankr Wrapped</span> exists
        </h1>
        <div className="space-y-3 text-left text-sm leading-relaxed text-muted-foreground">
          {WHY_COPY.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </motion.div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Built by
        </p>
        <div className="grid grid-cols-2 gap-3">
          {BUILDERS.map((b, i) => (
            <motion.a
              key={b.handle}
              href={`https://x.com/${b.handle}`}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.15 + i * 0.1 }}
              className="glass flex items-center justify-between gap-2 rounded-2xl p-4 transition-colors hover:border-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate font-display font-bold">{b.name}</p>
                <p className="truncate text-xs text-muted-foreground">@{b.handle}</p>
              </div>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}
