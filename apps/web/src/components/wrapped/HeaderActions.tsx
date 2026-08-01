import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Info, Share2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { searchHandles } from "@/lib/wrapped-data";

const BUILDERS = [
  { name: "Kabeer", handle: "basedkabeer" },
  { name: "01CryptoGen", handle: "01CryptoGen" },
];

const SUMMARY_TEXT =
  "A cinematic recap of your year on Bankr, built by the community for the community.";

export function HeaderActions() {
  const [open, setOpen] = useState<"about" | "socials" | "team" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  // PFPs sourced from Bankr's own search API - same trusted mechanism
  // used everywhere else in the app, since Bankr's own index pulls the
  // real X profile image for a given handle.
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      BUILDERS.map(async (b) => {
        const results = await searchHandles(b.handle);
        const match = results.find((r) => r.username.toLowerCase() === b.handle.toLowerCase());
        return [b.handle, match?.profileImageUrl ?? null] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setAvatars(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: "about" | "socials" | "team") => setOpen((o) => (o === key ? null : key));

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={() => toggle("about")}
        className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3"
      >
        <Info className="size-3.5" /> <span className="hidden sm:inline">About</span>
      </button>
      <button
        type="button"
        onClick={() => toggle("socials")}
        className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3"
      >
        <Share2 className="size-3.5" /> <span className="hidden sm:inline">Socials</span>
      </button>
      <button
        type="button"
        onClick={() => toggle("team")}
        className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3"
      >
        <Users className="size-3.5" /> <span className="hidden sm:inline">Team</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-glass-border bg-background p-4 text-left shadow-2xl"
          >
            {open === "about" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{SUMMARY_TEXT}</p>
                <Link
                  to="/about"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  Full story <ExternalLink className="size-3.5" />
                </Link>
              </div>
            )}

            {open === "socials" && (
              <div className="space-y-1">
                <a href="https://x.com/bankrwrapped"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                >
                  <span className="text-sm font-medium">X</span>
                  <span className="text-xs text-muted-foreground">@bankrwrapped</span>
                </a>
              </div>
            )}

            {open === "team" && (
              <div className="space-y-1">
                {BUILDERS.map((b) => (
                  <a key={b.handle}
                    href={`https://x.com/${b.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/10"
                  >
                    {avatars[b.handle] ? (
                      <img
                        src={avatars[b.handle] as string}
                        alt=""
                        className="size-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {b.name.charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{b.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{b.handle}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
