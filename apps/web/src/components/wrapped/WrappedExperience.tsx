// The signed-in Wrapped: a full-screen motion story, then the finale with
// every share card. The story's scene list is fixed when it starts (scenes
// depend on rankings, which load separately, so it waits briefly for them),
// while each scene and card renders from the latest profile, so volume that
// finishes mid-story shows up.
import { useEffect, useState } from "react";
import { useRanks } from "@/hooks/use-ranks";
import type { WrappedProfile } from "@/lib/wrapped-data";
import { Finale } from "./story/Finale";
import { buildScenes, type Scene } from "./story/scenes";
import { StoryPlayer } from "./story/StoryPlayer";

// How long the story waits for rankings before starting without them.
const RANKS_WAIT_MS = 2500;

function notices(p: WrappedProfile): string[] {
  const missing: string[] = [];
  if (p.creatorFeesStatus === "unavailable") missing.push("your launch earnings");
  if (p.beneficiaryFeesStatus === "unavailable") missing.push("your Please Bro earnings");
  const out: string[] = [];
  if (missing.length > 0) {
    out.push(`We couldn't load ${missing.join(" or ")} right now, so those cards are missing. Your other cards are ready. Reload in a minute to try again.`);
  }
  if (p.earningsPartial) out.push("Some fees couldn't be priced and count as 0, so earnings show as “at least”.");
  if (p.tradingVolume.status === "pending") out.push("Your trading volume is still being counted. Its card appears here when it's ready.");
  if (p.tradingVolume.status === "unavailable") out.push("We couldn't count your trading volume right now, so its card is missing. Reload later to try again.");
  return out;
}

export function WrappedExperience({ profile }: { profile: WrappedProfile }) {
  const boards = useRanks(profile.handle);
  const [waited, setWaited] = useState(false);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [mode, setMode] = useState<"story" | "finale">("story");
  const ctx = { profile, boards };

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), RANKS_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (scenes === null && (boards !== null || waited)) setScenes(buildScenes({ profile, boards }));
  }, [boards, waited, scenes, profile]);

  if (mode === "finale") {
    return (
      <Finale
        ctx={ctx}
        notices={notices(profile)}
        onReplay={() => {
          setScenes(buildScenes(ctx));
          setMode("story");
          window.scrollTo(0, 0);
        }}
      />
    );
  }
  if (!scenes) return <div className="fixed inset-0 bg-[#0b0910]" />;
  return (
    <StoryPlayer
      key={scenes.map((s) => s.id).join()}
      scenes={scenes}
      ctx={ctx}
      onFinish={() => {
        setMode("finale");
        window.scrollTo(0, 0);
      }}
    />
  );
}
