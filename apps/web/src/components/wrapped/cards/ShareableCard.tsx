// The share card canvas and its actions. A card face is a fixed 360×450
// (4:5) frame, so it looks the same in the card wall, the lightbox and the
// exported image (captured at 3×: 1080×1350). Callers scale it with
// ScaledCard; the capture reads the unscaled frame. Faces need a solid
// background (backdrop blur doesn't survive html-to-image) and avatars routed
// through proxiedImageUrl.
import { toBlob } from "html-to-image";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { COLORS, Grain } from "@/components/wrapped/story/motion";

export const CARD_W = 360;
export const CARD_H = 450;
const SITE_URL = "https://bankrwrapped.com";

export type Tone = "violet" | "ember" | "magenta" | "gold" | "indigo";

// Two light sources per tone, set at different corners so neighbouring cards
// in the wall don't repeat.
const TONES: Record<Tone, string> = {
  violet: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklch, ${COLORS.violet} 70%, transparent), transparent 60%), radial-gradient(90% 70% at 100% 100%, color-mix(in oklch, ${COLORS.ember} 35%, transparent), transparent 65%)`,
  ember: `radial-gradient(110% 90% at 100% 0%, color-mix(in oklch, ${COLORS.ember} 65%, transparent), transparent 60%), radial-gradient(90% 70% at 0% 100%, color-mix(in oklch, ${COLORS.violet} 45%, transparent), transparent 65%)`,
  magenta: `radial-gradient(120% 80% at 50% 0%, color-mix(in oklch, ${COLORS.magenta} 60%, transparent), transparent 62%), radial-gradient(80% 60% at 100% 100%, color-mix(in oklch, ${COLORS.indigo} 55%, transparent), transparent 65%)`,
  gold: `radial-gradient(110% 85% at 0% 100%, color-mix(in oklch, ${COLORS.gold} 55%, transparent), transparent 60%), radial-gradient(90% 70% at 100% 0%, color-mix(in oklch, ${COLORS.ember} 45%, transparent), transparent 62%)`,
  indigo: `radial-gradient(120% 90% at 100% 100%, color-mix(in oklch, ${COLORS.indigo} 75%, transparent), transparent 60%), radial-gradient(80% 60% at 0% 0%, color-mix(in oklch, ${COLORS.magenta} 35%, transparent), transparent 62%)`,
};

export function CardFrame({
  eyebrow,
  handle,
  tone,
  children,
  ref,
}: {
  eyebrow: string;
  handle: string;
  tone: Tone;
  children: ReactNode;
  ref?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={ref}
      className="relative flex flex-col overflow-hidden rounded-[28px] border border-white/12 p-7 text-white"
      style={{ width: CARD_W, height: CARD_H, background: `${TONES[tone]}, #0d0b12` }}
    >
      <Grain opacity={0.12} />
      <div className="relative flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-white/60">
        <span>{eyebrow}</span>
        <span>{new Date().getUTCFullYear()}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-end">{children}</div>
      <div className="relative mt-5 flex items-center justify-between border-t border-white/10 pt-3 font-mono text-[10px] text-white/55">
        <span>@{handle}</span>
        <span>
          Bankr <span className="text-gradient">Wrapped</span>
        </span>
      </div>
    </div>
  );
}

// Renders a 360×450 card face at whatever width its container has.
export function ScaledCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / CARD_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`relative w-full ${className ?? ""}`} style={{ height: CARD_H * scale }}>
      <div className="absolute left-0 top-0" style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; label: string } | { kind: "error"; label: string };

function renderCard(node: HTMLElement): Promise<Blob> {
  return toBlob(node, { pixelRatio: 3, cacheBust: true }).then((blob) => {
    if (!blob) throw new Error("empty image");
    return blob;
  });
}

export function ShareActions({
  faceRef,
  id,
  handle,
  shareText,
}: {
  faceRef: RefObject<HTMLDivElement | null>;
  id: string;
  handle: string;
  // The X post text for this card; the site link is appended.
  shareText: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  useEffect(() => setStatus({ kind: "idle" }), [id]);

  const run = async (label: string, action: (node: HTMLElement) => Promise<void>) => {
    if (!faceRef.current || status.kind === "busy") return;
    setStatus({ kind: "busy" });
    try {
      await action(faceRef.current);
      setStatus({ kind: "done", label });
    } catch (e) {
      // A dismissed share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return setStatus({ kind: "idle" });
      setStatus({ kind: "error", label: "Couldn't make the image. Try again." });
    }
  };

  const save = () =>
    run("Saved", async (node) => {
      const blob = await renderCard(node);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bankr-wrapped-${handle}-${id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

  const canCopy = typeof window !== "undefined" && "ClipboardItem" in window;

  // Safari only allows clipboard writes started inside the click, so the
  // ClipboardItem gets the render as a promise rather than a finished blob.
  const copy = () =>
    run("Copied. Paste it into your post", async (node) => {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": renderCard(node) })]);
    });

  const post = () => {
    const text = `${shareText}\n\n${SITE_URL}`;
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    const phone = typeof navigator.canShare === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (phone) {
      // The native share sheet can attach the image itself.
      return run("Shared", async (node) => {
        const blob = await renderCard(node);
        const file = new File([blob], `bankr-wrapped-${id}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file], text })) await navigator.share({ files: [file], text });
        else window.location.assign(intent);
      });
    }
    // Desktop: X has to open inside the click or it's popup-blocked, and an
    // intent can't carry an image, so the card goes on the clipboard to paste.
    window.open(intent, "_blank", "noopener,noreferrer");
    if (canCopy) {
      void run("Image copied. Paste it into your post", async (node) => {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": renderCard(node) })]);
      });
    }
  };

  const btn =
    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50";
  return (
    <div className="w-full space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={post} disabled={status.kind === "busy"} className={`${btn} bg-accent text-accent-foreground`}>
          <Share2 className="size-3.5" /> Post
        </button>
        {canCopy && (
          <button type="button" onClick={copy} disabled={status.kind === "busy"} className={`${btn} bg-white/10 hover:bg-white/15`}>
            <Copy className="size-3.5" /> Copy
          </button>
        )}
        <button type="button" onClick={save} disabled={status.kind === "busy"} className={`${btn} bg-white/10 hover:bg-white/15`}>
          <Download className="size-3.5" /> Save
        </button>
      </div>
      <p role="status" className="min-h-4 text-center text-xs text-muted-foreground">
        {status.kind === "busy" && "Getting ready…"}
        {status.kind === "done" && (
          <span className="inline-flex items-center gap-1">
            <Check className="size-3.5 text-accent" /> {status.label}
          </span>
        )}
        {status.kind === "error" && <span className="text-destructive">{status.label}</span>}
      </p>
    </div>
  );
}
