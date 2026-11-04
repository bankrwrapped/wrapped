// apps/web/src/components/wrapped/Landing.tsx
// The complete redesigned landing, composed from section components.
// Order (locked): Hero → Thesis → Leaderboard → Skill-install →
// Sign-in/Generate/CA → big Footer.

import { Backdrop } from "@/components/wrapped/terminal/Backdrop";
import { LandingHeader } from "@/components/wrapped/landing/LandingHeader";
import { LandingHero } from "@/components/wrapped/landing/LandingHero";
import { LandingThesis } from "@/components/wrapped/landing/LandingThesis";
import { LandingLeaderboard } from "@/components/wrapped/landing/LandingLeaderboard";
import { LandingSkill } from "@/components/wrapped/landing/LandingSkill";
import { LandingSignIn } from "@/components/wrapped/landing/LandingSignIn";
import { LandingFooter } from "@/components/wrapped/landing/LandingFooter";
import { Reveal } from "@/components/wrapped/landing/Reveal";

export function Landing() {
  return (
    <Backdrop>
      <LandingHeader />
      <div className="landing-wrap">
        <LandingHero />
        <LandingThesis />
        <LandingLeaderboard />
        <Reveal>
          <LandingSkill />
        </Reveal>
        <Reveal>
          <LandingSignIn />
        </Reveal>
      </div>
      <LandingFooter />
    </Backdrop>
  );
}
