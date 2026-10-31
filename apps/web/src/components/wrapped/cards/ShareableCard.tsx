// One Wrapped card that can be shared on its own: the card face is captured
// with html-to-image (so it needs a solid background - backdrop blur doesn't
// survive capture - and avatars routed through proxiedImageUrl), and the
// actions under it save, copy or post that one card.
import { toBlob } from "html-to-image";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

const SITE_URL = "https://bankrwrapped.com";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; label: string } | { kind: "error"; label: string };

function renderCard(node: HTMLElement): Promise<Blob> {
  return toBlob(node, { pixelRatio: 2, cacheBust: true }).then((blob) => {
    if (!blob) throw new Error("empty image");
    return blob;
  });
}

export function ShareableCard({
  id,
  eyebrow,
  handle,
  shareText,
  children,
}: {
  id: string;
  eyebrow: string;
  handle: string;
  // The X post text for this card; the site link is appended.
  shareText: string;
  children: ReactNode;
}) {
  const faceRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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

  // Safari only allows clipboard writes started inside the click, so the
  // ClipboardItem gets the render as a promise rather than a finished blob.
  const copy = () =>
    run("Copied. Paste it into your post", async (node) => {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": renderCard(node) })]);
    });

  const canCopy = typeof window !== "undefined" && "ClipboardItem" in window;

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
    "glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50";

  return (
    <section className="mx-auto w-full max-w-md" aria-label={eyebrow}>
      <div
        ref={faceRef}
        className="relative flex aspect-[4/5] flex-col overflow-hidden rounded-3xl border border-glass-border bg-background p-6 sm:p-7"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-accent/20" />
        <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
        <div className="relative flex flex-1 flex-col justify-center">{children}</div>
        <div className="relative flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>@{handle}</span>
          <span>
            Bankr <span className="text-gradient">Wrapped</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={post} disabled={status.kind === "busy"} className={btn}>
          <Share2 className="size-3.5" /> Share this card
        </button>
        {canCopy && (
          <button type="button" onClick={copy} disabled={status.kind === "busy"} className={btn}>
            <Copy className="size-3.5" /> Copy image
          </button>
        )}
        <button type="button" onClick={save} disabled={status.kind === "busy"} className={btn}>
          <Download className="size-3.5" /> Save image
        </button>
        <span role="status" className="text-xs text-muted-foreground">
          {status.kind === "busy" && "Getting ready…"}
          {status.kind === "done" && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-accent" /> {status.label}
            </span>
          )}
          {status.kind === "error" && <span className="text-destructive">{status.label}</span>}
        </span>
      </div>
    </section>
  );
}
