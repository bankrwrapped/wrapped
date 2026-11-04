import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AboutContent } from "@/components/wrapped/AboutContent";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About \u00B7 Bankr Wrapped" },
      { name: "description", content: "What Bankr Wrapped is, and who built it." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <Backdrop>
      <div className="page-pad relative z-10 min-h-screen w-full py-8">
        <div className="mb-8 flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md object-contain" />
          <span className="text-base font-medium">Bankr Wrapped</span>
        </div>
        <Link
          to="/"
          className="mb-12 flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
        </Link>
        <AboutContent />
      </div>
    </Backdrop>
  );
}
