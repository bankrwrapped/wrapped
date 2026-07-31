import type { WrappedProfile } from "@/lib/wrapped-data";

export type Archetype = {
  title: string;
  description: string;
};

/**
 * Thresholds below are first-pass estimates, not measured against real
 * distribution data yet. Expect to tune these once run against real wallets.
 */
export function getArchetype(p: WrappedProfile): Archetype {
  const totalEarned = p.creatorEarnings + p.pleaseBroEarnings;
  const totalLifetime = totalEarned + p.unclaimed;

  // Whale
  if (totalEarned >= 5000) {
    return {
      title: "The Whale",
      description: "Serious earnings on Bankr — you're not playing small.",
    };
  }

  // Serial Launcher
  if (p.tokensLaunched >= 10) {
    return {
      title: "Serial Launcher",
      description: `${p.tokensLaunched} tokens deployed. You don't stop building.`,
    };
  }

  // The Sleeper
  if (p.unclaimed >= 50 && p.unclaimed > totalEarned * 2) {
    return {
      title: "The Sleeper",
      description: "Real money sitting unclaimed. Time to go get it.",
    };
  }

  // Please Bro Farmer
  const isFarmer =
    (p.tokensLaunched === 0 && p.pleaseBro.length >= 5) ||
    (p.tokensLaunched > 0 && p.pleaseBro.length >= p.tokensLaunched * 3);
  if (isFarmer) {
    return {
      title: "The Please Bro Farmer",
      description: `${p.pleaseBro.length} Please Bro tokens redirecting fees your way.`,
    };
  }

  // The Claimer
  if (totalEarned >= 50 && totalLifetime > 0 && p.unclaimed / totalLifetime < 0.25) {
    return {
      title: "The Claimer",
      description: "You earn it, you claim it. No fees left behind.",
    };
  }

  // One and Done
  if (p.tokensLaunched === 1) {
    const onlyToken = p.launched[0];
    if (onlyToken && onlyToken.volume !== null && onlyToken.volume >= 500) {
      return {
        title: "One and Done",
        description: "One launch, real volume. Quality over quantity.",
      };
    }
  }

  // Fallback
  return {
    title: "Just Getting Started",
    description: "Your Bankr story is just beginning.",
  };
}
