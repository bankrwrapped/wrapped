// Builder Type, keyed by tokens launched. Same table and copy as the Bankr
// bot skill (skills/bankr-wrapped/SKILL.md) so the site and the bot give a
// wallet the same title. No launches = no Builder Type.

export type BuilderType = { title: string; description: string };

const TIERS: Array<{ min: number; type: BuilderType }> = [
  { min: 51, type: { title: "The Final Boss", description: "Top of the food chain. I stopped counting and started taking notes." } },
  { min: 36, type: { title: "The Mint Kingpin", description: "Nobody launches this much by accident." } },
  { min: 21, type: { title: "The Launch Warlord", description: "You've got a whole territory of tokens out here." } },
  { min: 11, type: { title: "The Deploy Machine", description: "Double digits and still going. This is a habit, not a phase." } },
  { min: 6, type: { title: "The Trench Regular", description: "You know the drill by now. I know your wallet by now too." } },
  { min: 2, type: { title: "The Repeat Offender", description: "Once wasn't enough. Noted." } },
  { min: 1, type: { title: "The Launch Pioneer", description: "First flag planted. Everyone's story starts on this line." } },
];

export function getBuilderType(tokensLaunched: number): BuilderType | null {
  return TIERS.find((t) => tokensLaunched >= t.min)?.type ?? null;
}
