import { Button } from "@/components/ui/button";

type Step = { emoji: string; title: string; body: string };

const STEPS: Step[] = [
  {
    emoji: "\u{1F4AC}",
    title: "Build Mindshare",
    body: "Engage with Bankr on X and Farcaster, and use the Bankr bot for research and trading.",
  },
  {
    emoji: "\u{1FA99}",
    title: "Hold BNKR",
    body: "Keep BNKR in your linked wallet to grow your BNKR score.",
  },
  {
    emoji: "\u{1F4C8}",
    title: "Trade On-Chain",
    body: "Use Bankr for on-chain activity to build your trading performance.",
  },
  {
    emoji: "\u{1F680}",
    title: "Deploy & Build",
    body: "Launch tokens and build products through the Bankr ecosystem.",
  },
  {
    emoji: "\u{1F91D}",
    title: "Invite Friends",
    body: "Share your referral link and earn referral points as others join.",
  },
];

type Props = {
  onBack: () => void;
};

export function NoActivityState({ onBack }: Props) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute -left-32 top-0 size-[30rem] animate-drift rounded-full bg-primary/30 blur-[130px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

      <div className="relative z-10 w-full max-w-lg space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="animate-rise font-display text-4xl font-extrabold sm:text-5xl">
            Your story is just getting started.
          </h1>
          <p className="animate-rise text-base text-muted-foreground">
            We couldn't find enough activity to generate your Bankr Wrapped yet.
            Start contributing to the ecosystem and your story will come to life.
          </p>
        </div>

        <div className="glass animate-rise space-y-0 rounded-2xl p-6 text-left">
          {STEPS.map((step, i) => (
            <div key={step.title}>
              <div className="flex items-start gap-3 py-3">
                <span className="text-2xl leading-none">{step.emoji}</span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className="pl-3 text-center text-muted-foreground">↓</div>
              )}
            </div>
          ))}
        </div>

        <div className="animate-rise space-y-3">
          <a href="https://bankr.bot" target="_blank" rel="noreferrer" className="block">
            <Button variant="hero" size="xl" className="w-full">
              Check My Progress
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            Ask the Bankr bot for your latest scores anytime.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Search another handle
          </button>
        </div>
      </div>
    </main>
  );
}
