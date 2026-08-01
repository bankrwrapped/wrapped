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
import { Footer } from "@/components/wrapped/Footer";
import { LiquidGlassBackdrop } from "@/components/wrapped/LiquidGlassBackdrop";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function BrandBackdrop() {
  return (
    <>
      <LiquidGlassBackdrop />
      <div className="fixed left-5 top-5 z-20 flex items-center gap-2.5">
        <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
        </div>
        <span className="font-display text-sm font-bold tracking-tight">
          Bankr <span className="text-gradient">Wrapped</span>
        </span>
      </div>
    </>
  );
}

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <BrandBackdrop />
      <div className="glass relative z-10 max-w-md space-y-3 rounded-3xl p-8 text-center">
        <h1 className="font-display text-7xl font-extrabold text-gradient">404</h1>
        <h2 className="font-display text-xl font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="pt-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Go home
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <BrandBackdrop />
      <div className="glass relative z-10 max-w-md space-y-3 rounded-3xl p-8 text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          This page didn't load
        </h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <a href="/"
            className="glass inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors hover:text-accent"
          >
            Go home
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
        href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600&display=swap",
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
      <Footer />
    </QueryClientProvider>
  );
}
