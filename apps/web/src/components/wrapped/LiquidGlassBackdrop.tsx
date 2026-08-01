// Shared background treatment, isolated to its own stacking context so
// blend-mode effects can't leak onto text elsewhere on the page.
//
// IMPORTANT: the darkening layer below never goes fully transparent at
// any point - a previous version used "via-transparent" in the middle
// stop, which left a real gap with zero scrim exactly where most page
// text sits, making it unreadable against the photo's brighter areas.
// Every stop now keeps a real minimum opacity.
export function LiquidGlassBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 isolate">
      <img
        src="/liquid-glass-bg.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 mix-blend-overlay bg-gradient-to-br from-primary/45 via-transparent to-accent/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/55 via-background/40 to-background/65" />
      <div className="absolute -left-24 top-1/4 size-[26rem] animate-drift rounded-full bg-primary/50 mix-blend-screen blur-[130px]" />
      <div className="absolute -right-24 bottom-0 size-[24rem] animate-glow-pulse rounded-full bg-accent/45 mix-blend-screen blur-[130px]" />
    </div>
  );
}
