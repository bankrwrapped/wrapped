// apps/web/src/routes/soon.tsx
//
// The /soon route — coming-soon destination for all landing CTAs while the
// six-scene reveal is still being built. No auth, no data fetch; just the
// ComingSoon component (message + $BNW CA + blurred teaser card).

import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/wrapped/ComingSoon";

export const Route = createFileRoute("/soon")({
  head: () => ({
    meta: [
      { title: "Bankr Wrapped · Coming soon" },
      {
        name: "description",
        content: "Your Bankr Wrapped reveal drops this week. Grab $BNW and come back to watch your year.",
      },
      { property: "og:title", content: "Bankr Wrapped · Coming soon" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComingSoon,
});