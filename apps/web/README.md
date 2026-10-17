# apps/web

The Bankr Wrapped frontend, built with React 19 + [TanStack Start](https://tanstack.com/start) and deployed as a Cloudflare Worker (Lovable / Nitro build).

## Current state

- **Live:** the landing page, `/leaderboard`, `/about`, and `/soon`.
- **Gated sign-in:** "Connect X" goes to `/soon` on purpose until launch. At launch, point it at `X_LOGIN_URL` (`src/lib/wrapped-data.ts`).
- **The reveal isn't built yet:** the signed-in view is a placeholder until the reveal sequence is.

## API access: same-origin proxy

`src/server.ts` forwards `/api/*` and `/auth/*` to the Bankr Wrapped API (`API_ORIGIN`, defaulting to the Railway URL). It passes OAuth redirects and `Set-Cookie` headers through unchanged, and forwards the visitor's IP and protocol.

The browser only ever talks to bankrwrapped.com, so the session cookie is first-party. That's required for Safari and iOS, which block third-party cookies.

Frontend code calls the API with relative URLs (`API_URL` is `""` by default). Set `VITE_API_URL` only to bypass the proxy, for example to point a dev build straight at a local API.

## Stack

- React 19, TanStack Start / Router, TanStack Query
- Tailwind CSS 4, shadcn/ui (Radix)
- Three.js via `@react-three/fiber` / `drei` / `postprocessing` for the visuals
- Payload types are imported from `@bankr-wrapped/shared`

## Run

```bash
bun install
bun run dev         # Vite dev server
bun run typecheck
bun run test        # proxy + URL helper tests
```

For real data, run `apps/api` locally (set `API_ORIGIN` / `VITE_API_ORIGIN` to it) or use the deployed API.

## Notes

- **Keep the 3D layer code-split** behind the reveal trigger, so it isn't loaded on first page load.
- **Design for mid-tier mobile first.** Full effects are a progressive enhancement.
