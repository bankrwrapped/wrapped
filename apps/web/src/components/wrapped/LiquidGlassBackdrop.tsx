// Shared background treatment - replaces flat, near-opaque gray scrims
// (background/80-90 stacked opacity) that were dimming the photo into a
// dull, disconnected backdrop. Blend modes let our brand-color tint and
// glow blobs actually interact with the image's own highlight streaks,
// so it reads as one lit scene rather than a photo under a gray film.
export function LiquidGlassBackdrop() {
  return (
    <>
      <img
        src="/liquid-glass-bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none fixed inset-0 size-full object-cover"
      />
      <div className="pointer-events-none fixed inset-0 mix-blend-overlay bg-gradient-to-br from-primary/45 via-transparent to-accent/40" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-background/45 via-transparent to-background/60" />
      <div className="pointer-events-none fixed -left-24 top-1/4 size-[26rem] animate-drift rounded-full bg-primary/50 mix-blend-screen blur-[130px]" />
      <div className="pointer-events-none fixed -right-24 bottom-0 size-[24rem] animate-glow-pulse rounded-full bg-accent/45 mix-blend-screen blur-[130px]" />
    </>
  );
}
