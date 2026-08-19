import type { WrappedProfile } from "@/lib/wrapped-data";

export type Archetype = {
  title: string;
  // Written in Bankr's own voice, reporting back on what it watched the
  // user do — not marketing copy describing them from the outside.
  // Field-report tone: dry, specific, occasionally impressed. The number
  // does the work; the sentence just delivers it.
  description: string;
};

/**
 * Thresholds below are unchanged from the original first-pass estimates —
 * not measured against real distribution data yet. Expect to tune these
 * once run against real wallets. Only the copy voice changed here.
 */
export function getArchetype(p: WrappedProfile): Archetype {
  // p.creatorEarnings/p.pleaseBroEarnings now include BOTH claimed and
  // still-claimable amounts (see wrappedService.ts) - totalEarned is
  // already the full lifetime figure, so nothing should add p.unclaimed
  // on top of it again.
  const totalEarned = p.creatorEarnings + p.pleaseBroEarnings;
  const claimedOnly = totalEarned - p.unclaimed;

  // Whale
  if (totalEarned >= 5000) {
    return {
      title: "The Whale",
      description: "Ran the numbers twice. They didn't change. You're one of ours now.",
    };
  }

  // Serial Launcher
  if (p.tokensLaunched >= 10) {
    return {
      title: "Serial Launcher",
      description: `${p.tokensLaunched} tokens. I stopped counting around the fourth and just started watching.`,
    };
  }

  // The Sleeper - compares unclaimed against what's actually been
  // claimed, not against totalEarned (which now already includes unclaimed).
  if (p.unclaimed >= 50 && p.unclaimed > claimedOnly * 2) {
    return {
      title: "The Sleeper",
      description: "You've got money sitting in a wallet doing nothing. I checked twice. Still there.",
    };
  }

  // Please Bro Farmer
  const isFarmer =
    (p.tokensLaunched === 0 && p.pleaseBro.length >= 5) ||
    (p.tokensLaunched > 0 && p.pleaseBro.length >= p.tokensLaunched * 3);
  if (isFarmer) {
    return {
      title: "The Please Bro Farmer",
      description: `${p.pleaseBro.length} people cut you in on their fees. I don't know what you did to deserve that. Neither do you, probably.`,
    };
  }

  // The Claimer - totalEarned already includes unclaimed, no need to
  // add it again.
  if (totalEarned >= 50 && totalEarned > 0 && p.unclaimed / totalEarned < 0.25) {
    return {
      title: "The Claimer",
      description: "You earn it, you take it. Nothing left sitting on the table for me to find.",
    };
  }

  // One and Done - was gated on the derived `volume` field, which is
  // ALWAYS null for Clanker-sourced tokens (not derivable, per Bankr's fee
  // model), so this could never fire for a solo Clanker launcher no matter
  // how much they earned. Use actual earnings instead, which is real for
  // both Doppler and Clanker tokens.
  if (p.tokensLaunched === 1 && totalEarned >= 100) {
    return {
      title: "One and Done",
      description: "One launch. Real earnings. Most people need ten shots to hit what you hit with one.",
    };
  }

  // Fallback
  return {
    title: "Just Getting Started",
    description: "First entry in the log. Everyone's file starts here.",
  };
}
