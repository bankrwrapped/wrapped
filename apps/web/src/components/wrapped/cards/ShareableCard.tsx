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

// One light per tone, each from its own corner, so every card reads as its
// own color and neighbouring cards in the wall don't repeat.
const TONES: Record<Tone, string> = {
  violet: `radial-gradient(130% 95% at 0% 0%, color-mix(in oklch, ${COLORS.violet} 62%, transparent), transparent 64%)`,
  ember: `radial-gradient(120% 95% at 100% 0%, color-mix(in oklch, ${COLORS.ember} 58%, transparent), transparent 64%)`,
  magenta: `radial-gradient(130% 85% at 50% 0%, color-mix(in oklch, ${COLORS.magenta} 55%, transparent), transparent 66%)`,
  gold: `radial-gradient(120% 90% at 0% 100%, color-mix(in oklch, ${COLORS.gold} 48%, transparent), transparent 64%)`,
  indigo: `radial-gradient(130% 95% at 100% 100%, color-mix(in oklch, ${COLORS.indigo} 70%, transparent), transparent 64%)`,
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
      className="relative flex flex-col overflow-hidden rounded-[24px] border border-white/12 p-7 text-white"
      style={{ width: CARD_W, height: CARD_H, background: `${TONES[tone]}, #0d0b12` }}
    >
      <Grain opacity={0.12} />
      <div className="relative flex items-center justify-between font-mono text-[11px] text-white/65">
        <span>{eyebrow}</span>
        <span>{new Date().getUTCFullYear()}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-end">{children}</div>
      <div className="relative mt-5 flex items-center justify-between border-t border-white/10 pt-3 font-mono text-[11px] text-white/60">
        <span>@{handle}</span>
        <span>Bankr Wrapped</span>
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
    <div
      ref={ref}
      className={`relative w-full ${className ?? ""}`}
      style={{ height: CARD_H * scale }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: CARD_W,
          height: CARD_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; label: string }
  | { kind: "error"; label: string };

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

  // The PNG is rendered ahead of the click: browsers only allow sharing and
  // clipboard writes close to the user's tap, and a 3x render can take over a
  // second (long enough for iOS to refuse navigator.share). It's re-rendered
  // when the face's content changes (a count-up settling, a volume update).
  const png = useRef<{ node: HTMLElement; blob: Promise<Blob> } | null>(null);
  const image = (node: HTMLElement): Promise<Blob> => {
    if (png.current?.node !== node) {
      const blob = renderCard(node);
      const entry = { node, blob };
      png.current = entry;
      blob.catch(() => {
        if (png.current === entry) png.current = null;
      });
    }
    return png.current!.blob;
  };
  useEffect(() => {
    png.current = null;
    const node = faceRef.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout>;
    const warm = () => {
      clearTimeout(timer);
      png.current = null;
      timer = setTimeout(() => void image(node).catch(() => {}), 600);
    };
    warm();
    const mo = new MutationObserver(warm);
    mo.observe(node, { childList: true, characterData: true, subtree: true });
    return () => {
      clearTimeout(timer);
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, faceRef]);

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
      const blob = await image(node);
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
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image(node) })]);
    });

  const post = () => {
    const text = `${shareText}\n\n${SITE_URL}`;
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    const phone =
      typeof navigator.canShare === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (phone) {
      // The native share sheet can attach the image itself. The image is
      // normally pre-rendered, so share() still runs within the tap.
      return run("Shared", async (node) => {
        const blob = await image(node);
        const file = new File([blob], `bankr-wrapped-${id}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file], text }))
          await navigator.share({ files: [file], text });
        else window.location.assign(intent);
      });
    }
    // Desktop: an intent can't carry an image, so the card goes on the
    // clipboard to paste. The write starts first, while this page still has
    // focus (opening X takes it away and Chrome then refuses the write); X
    // still opens inside the click so it isn't popup-blocked.
    if (canCopy) {
      void run("Image copied. Paste it into your post", async (node) => {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": image(node) })]);
      });
    }
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  const btn =
    "flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-medium transition-colors disabled:opacity-50";
  return (
    <div className="w-full space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={post}
          disabled={status.kind === "busy"}
          className={`${btn} bg-[#ededed] text-[#141415] hover:bg-white`}
        >
          <Share2 className="size-4" strokeWidth={1.5} /> Post
        </button>
        {canCopy && (
          <button
            type="button"
            onClick={copy}
            disabled={status.kind === "busy"}
            className={`${btn} bg-white/10 hover:bg-white/15`}
          >
            <Copy className="size-4" strokeWidth={1.5} /> Copy
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={status.kind === "busy"}
          className={`${btn} bg-white/10 hover:bg-white/15`}
        >
          <Download className="size-4" strokeWidth={1.5} /> Save
        </button>
      </div>
      <p role="status" className="min-h-4 text-center text-xs text-muted-foreground">
        {status.kind === "busy" && "Getting ready…"}
        {status.kind === "done" && (
          <span className="inline-flex items-center gap-1">
            <Check className="size-4 text-accent" strokeWidth={1.5} /> {status.label}
          </span>
        )}
        {status.kind === "error" && <span className="text-destructive">{status.label}</span>}
      </p>
    </div>
  );
}
