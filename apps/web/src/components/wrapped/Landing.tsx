// apps/web/src/components/wrapped/Landing.tsx
// The complete redesigned landing, composed from section components.
// Order (locked): Hero → Thesis → Leaderboard → Sign-in/Generate/CA →
// Skill-install → big Footer. The WebGL braid layers under this later.

import { BraidCanvas } from "@/components/wrapped/braid/BraidCanvas";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";
import { LandingHeader } from "@/components/wrapped/landing/LandingHeader";
import { LandingHero } from "@/components/wrapped/landing/LandingHero";
import { LandingThesis } from "@/components/wrapped/landing/LandingThesis";
import { LandingLeaderboard } from "@/components/wrapped/landing/LandingLeaderboard";
import { LandingSignIn } from "@/components/wrapped/landing/LandingSignIn";
import { LandingSkill } from "@/components/wrapped/landing/LandingSkill";
import { LandingFooter } from "@/components/wrapped/landing/LandingFooter";

export function Landing() {
  return (
    <Backdrop>
      <BraidCanvas />
      <LandingHeader />
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 40px" }}>
        <LandingHero />
        <LandingThesis />
        <LandingLeaderboard />
        <LandingSignIn />
        <LandingSkill />
      </div>
      <LandingFooter />
    </Backdrop>
  );
}
