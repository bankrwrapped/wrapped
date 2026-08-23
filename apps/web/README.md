# apps/web

Frontend for Bankr Wrapped. React + TanStack Start.

## Current state

The full six-scene reveal experience is designed (see the project's shared spec doc) but not yet built. Live right now: a flat landing page with a WebGL double-helix braid background. All CTAs (Connect X, Generate) route to `/soon` — a coming-soon page showing a blurred share-card teaser and the $BNW contract address. No OAuth is triggered yet from the landing page.

## Stack

- React + [TanStack Start](https://tanstack.com/start)
- Three.js via `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing` (background/reveal visuals)
- Design system: violet + orange palette, Clash Display / PP Mori / Departure Mono fonts

## Pages (planned)

1. Landing (pre-sign-in) — hero CTA + public leaderboard
2. Leaderboard — top 20 + your rank if signed in
3. No-account redirect — sends new users to Bankr
4. No-data state — wallets under $1 total activity
5. Reveal sequence — profile → tokens → please-bro → earnings → volume (last, since it's the slowest to compute)
6. Share card — fixed 2–3 hero stats

## Auth

X sign-in only (no wallet-connect, no handle search). Handled entirely by `apps/api` (Module 14) — this app just redirects to the API's OAuth start route and reads the resulting session cookie.

## Run

```bash
bun install
bun run dev
```

Requires `apps/api` running locally for real data (or point at the deployed API).

## Notes

- 3D/visual layer must stay code-split behind the reveal trigger, not loaded on initial page load.
- Design for mid-tier mobile first — full effects are a progressive enhancement, not the default.