// Shared background treatment. The blend-mode layers are wrapped in their
// own isolated stacking context (isolation: isolate) - without this,
// mix-blend-mode can leak beyond its intended container and interact with
// elements it shouldn't, which was softening/fading text rendered nearby.
// Isolation guarantees the blending stays contained to the background art.
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
      <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-transparent to-background/60" />
      <div className="absolute -left-24 top-1/4 size-[26rem] animate-drift rounded-full bg-primary/50 mix-blend-screen blur-[130px]" />
      <div className="absolute -right-24 bottom-0 size-[24rem] animate-glow-pulse rounded-full bg-accent/45 mix-blend-screen blur-[130px]" />
    </div>
  );
}
