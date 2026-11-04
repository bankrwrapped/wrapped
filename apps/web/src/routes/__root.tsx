import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function BrandBackdrop() {
  return (
    <>
      <Backdrop />
      <div className="page-pad fixed inset-x-0 top-0 z-20 flex h-16 items-center gap-2">
        <img src="/logo.png" alt="" className="size-7 rounded-md object-contain" />
        <span className="text-base font-medium">Bankr Wrapped</span>
      </div>
    </>
  );
}

const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-[10px] bg-[#ededed] px-5 text-[15px] font-medium text-[#141415] transition-colors hover:bg-white";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-[10px] border border-white/10 bg-[#232325] px-5 text-[15px] font-medium transition-colors hover:border-white/20";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#141415] px-5">
      <BrandBackdrop />
      <div className="relative z-10 w-full max-w-[34rem]">
        <p className="font-mono text-xs text-[#85858b]">404</p>
        <h1 className="mt-3 font-display text-[32px] font-normal leading-tight tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#a1a1a6]">
          This page doesn&rsquo;t exist or has moved. Look up a handle from the start page instead.
        </p>
        <div className="mt-8">
          <Link to="/" className={primaryBtn}>
            Go to the start
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#141415] px-5">
      <BrandBackdrop />
      <div className="relative z-10 w-full max-w-[34rem]">
        <p className="font-mono text-xs text-[#85858b]">Error</p>
        <h1 className="mt-3 font-display text-[32px] font-normal leading-tight tracking-tight">
          This page didn&rsquo;t load
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#a1a1a6]">
          Something went wrong on our side. Try again, or head back to the start.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={primaryBtn}
          >
            Try again
          </button>
          <a href="/" className={secondaryBtn}>
            Go to the start
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Bankr Wrapped" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Global ambient video removed - now redundant. Every page renders
          its own full-bleed liquid-glass-bg.jpg background, and the one
          place video actually adds something (the loading screen) already
          has its own dedicated <video> element. This was decoding an mp4
          on every single page load for zero visible benefit. */}
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
