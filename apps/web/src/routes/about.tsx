import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { AboutContent } from "@/components/wrapped/AboutContent";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About \u2014 Bankr Wrapped" },
      { name: "description", content: "What Bankr Wrapped is, and who built it." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="relative min-h-screen">
      <img
        src="/liquid-glass-bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none fixed inset-0 size-full object-cover"
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-background/85 via-background/65 to-background/90" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/15" />

      <div className="relative z-10 mx-auto min-h-screen w-full max-w-xl px-5 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 16 }}
          className="mb-6 flex items-center gap-2.5"
        >
          <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">
            Bankr <span className="text-gradient">Wrapped</span>
          </span>
        </motion.div>

        <Link
          to="/"
          className="mb-8 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>

        <AboutContent />
      </div>
    </div>
  );
}
