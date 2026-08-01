import { motion } from "framer-motion";
import { Share2 } from "lucide-react";
import { AboutContent } from "@/components/wrapped/AboutContent";

export function SceneAboutOutro({ onShareCard }: { onShareCard: () => void }) {
  return (
    <div className="max-h-[70vh] w-full space-y-6 overflow-y-auto text-center">
      <AboutContent />
      <motion.button
        type="button"
        onClick={onShareCard}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.4 }}
        className="glass mx-auto flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors hover:text-accent"
      >
        <Share2 className="size-4 text-accent" /> Share your card
      </motion.button>
    </div>
  );
}
