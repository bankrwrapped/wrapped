import { useEffect, useState } from "react";
import type { WrappedProfile } from "@/lib/wrapped-data";

type Props = {
  profile: WrappedProfile;
  onDone: () => void;
};

// Brief "building your wrapped" beat that shows the found profile's pfp,
// then reveals that there's no activity yet, before handing off to the
// full State 1 screen. Tap anywhere to skip ahead.
export function SceneNoActivityReveal({ profile, onDone }: Props) {
  const [stage, setStage] = useState<"building" | "notice">("building");

  useEffect(() => {
    const toNotice = setTimeout(() => setStage("notice"), 1600);
    const toDone = setTimeout(() => onDone(), 3200);
    return () => {
      clearTimeout(toNotice);
      clearTimeout(toDone);
    };
  }, [onDone]);

  return (
    <main
      className="relative flex min-h-screen cursor-pointer flex-col items-center justify-center overflow-hidden px-5 text-center"
      onClick={onDone}
    >
      <div className="pointer-events-none absolute -left-32 top-0 size-[30rem] animate-drift rounded-full bg-primary/30 blur-[130px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

      <div className="relative z-10 space-y-6">
        <img
          src={profile.avatar}
          alt={profile.handle}
          className="glass animate-scene-in mx-auto size-24 rounded-full object-cover"
        />
        <p className="animate-rise text-lg text-muted-foreground">
          @{profile.handle}
        </p>

        {stage === "building" ? (
          <p className="animate-rise font-display text-2xl font-bold">
            Building your Bankr Wrapped…
          </p>
        ) : (
          <p className="animate-rise font-display text-2xl font-bold">
            No activity found yet.
          </p>
        )}
      </div>
    </main>
  );
}
