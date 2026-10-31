// The signed-in Wrapped: every card that has something true to show, in
// story order, then the leaderboards and a next step. Cards that depend on
// data that didn't load are left out, and a notice says which part is
// missing, so the rest still shows.
import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/wrapped/landing/Reveal";
import type { WrappedProfile } from "@/lib/wrapped-data";
import {
  BestDayCard,
  BuilderTypeCard,
  ClaimRhythmCard,
  EarningsCard,
  FirstLaunchCard,
  JobTitleCard,
  RanksCard,
  StarterPackCard,
  StreakCard,
  ThemesCard,
  TopTokenCard,
  VolumeCard,
} from "./cards/WrappedCards";

const CARDS = [
  BuilderTypeCard,
  JobTitleCard,
  FirstLaunchCard,
  EarningsCard,
  BestDayCard,
  TopTokenCard,
  StarterPackCard,
  ThemesCard,
  ClaimRhythmCard,
  StreakCard,
  VolumeCard,
  RanksCard,
];

function missingParts(p: WrappedProfile): string[] {
  const missing: string[] = [];
  if (p.creatorFeesStatus === "unavailable") missing.push("your launch earnings");
  if (p.beneficiaryFeesStatus === "unavailable") missing.push("your Please Bro earnings");
  return missing;
}

export function WrappedDeck({ profile }: { profile: WrappedProfile }) {
  const missing = missingParts(profile);
  return (
    <main className="relative min-h-screen px-5 py-10">
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/15 via-transparent to-accent/10" />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-10 [&>*:empty]:hidden">
        <header className="flex items-center gap-2.5">
          <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">
            @{profile.handle}&rsquo;s <span className="text-gradient">Wrapped</span>
          </span>
        </header>

        {missing.length > 0 && (
          <p role="status" className="glass rounded-2xl px-4 py-3 text-sm text-muted-foreground">
            We couldn&rsquo;t load {missing.join(" or ")} right now, so those cards are missing. Your other cards are
            ready. Reload in a minute to try again.
          </p>
        )}
        {profile.earningsPartial && (
          <p className="font-mono text-xs text-muted-foreground">
            Some fees couldn&rsquo;t be priced and count as 0, so earnings show as &ldquo;at least&rdquo;.
          </p>
        )}

        {CARDS.map((Card, i) => (
          <Reveal key={i} amount={0.2}>
            <Card profile={profile} />
          </Reveal>
        ))}

        <Reveal amount={0.2}>
          <section className="glass rounded-3xl p-6 text-center">
            <p className="font-display text-2xl font-extrabold">What&rsquo;s next?</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Every launch adds to next year&rsquo;s Wrapped. Keep building.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <a
                href="https://bankr.bot"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground"
              >
                Launch your next token with Bankr
              </a>
              <Link to="/leaderboard" className="glass rounded-full px-5 py-2.5 text-sm font-semibold">
                See all leaderboards
              </Link>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                Or ask the bot: &ldquo;@bankrbot show me my Bankr Wrapped&rdquo;
              </p>
            </div>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
