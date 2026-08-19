import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { AboutContent } from "@/components/wrapped/AboutContent";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About \u00B7 Bankr Wrapped" },
      { name: "description", content: "What Bankr Wrapped is, and who built it." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
      <Backdrop>
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
    </Backdrop>
  );
}
