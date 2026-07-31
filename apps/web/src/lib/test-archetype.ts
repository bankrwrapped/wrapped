import { lookupWrapped } from "@/lib/wrapped-data";
import { getArchetype } from "@/lib/archetype";

const handles = ["jessepollak", "basedkabeer", "degenMaxi0"];

for (const handle of handles) {
  try {
    const profile = await lookupWrapped(handle);
    const archetype = getArchetype(profile);
    console.log(`\n@${handle}`);
    console.log(`  tokensLaunched: ${profile.tokensLaunched}`);
    console.log(`  pleaseBro.length: ${profile.pleaseBro.length}`);
    console.log(`  creatorEarnings: ${profile.creatorEarnings}`);
    console.log(`  pleaseBroEarnings: ${profile.pleaseBroEarnings}`);
    console.log(`  unclaimed: ${profile.unclaimed}`);
    console.log(`  hasActivity: ${profile.hasActivity}`);
    console.log(`  -> ARCHETYPE: ${archetype.title}`);
    console.log(`     "${archetype.description}"`);
  } catch (err) {
    console.log(`\n@${handle} -> failed: ${String(err)}`);
  }
}
