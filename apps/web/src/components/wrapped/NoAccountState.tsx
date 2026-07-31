import { Button } from "@/components/ui/button";

const TEASER_ITEMS = [
  "\u{1F4AC} Building Mindshare",
  "\u{1FA99} Holding BNKR",
  "\u{1F4C8} Trading On-Chain",
  "\u{1F680} Deploying Tokens",
  "\u{1F91D} Referring Friends",
];

type Props = {
  onBack: () => void;
};

export function NoAccountState({ onBack }: Props) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute -left-32 top-0 size-[30rem] animate-drift rounded-full bg-primary/30 blur-[130px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

      <div className="relative z-10 w-full max-w-lg space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="animate-rise font-display text-4xl font-extrabold sm:text-5xl">
            No Bankr account found.
          </h1>
          <p className="animate-rise text-base text-muted-foreground">
            Create your Bankr account to start building your story.
            Once your account is active, every contribution you make can
            become part of your future Bankr Wrapped.
          </p>
        </div>

        <div className="glass animate-rise space-y-3 rounded-2xl p-6 text-left">
          <p className="text-sm font-semibold text-muted-foreground">
            Start contributing by:
          </p>
          <ul className="space-y-2">
            {TEASER_ITEMS.map((item) => (
              <li key={item} className="text-sm">{item}</li>
            ))}
          </ul>
          <p className="pt-1 text-sm text-muted-foreground">
            As your activity grows, so does your story.
          </p>
        </div>

        <div className="animate-rise space-y-3">
          <a href="https://bankr.bot" target="_blank" rel="noreferrer" className="block">
            <Button variant="hero" size="xl" className="w-full">
              Create a Bankr Account
            </Button>
          </a>
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
