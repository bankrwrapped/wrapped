# Bankr Wrapped

A Spotify-Wrapped-style reveal for [Bankr](https://bankr.bot) users — trading volume, creator earnings, and launch history, sourced from a purpose-built on-chain indexer rather than third-party APIs alone.

## Monorepo structure

```
apps/
  web/                 React (TanStack Start) frontend — sign-in, reveal sequence, leaderboard
  api/                 Bun.serve backend — auth, wrapped data serving, pricing, volume computation
indexer-base/           Envio HyperIndex indexer — Base chain
indexer-robinhood/       Envio HyperIndex indexer — Robinhood Chain
packages/
  shared/               Shared TypeScript types (WrappedPayload, TokenRef, etc.)
```

`indexer-base` and `indexer-robinhood` are fully independent Envio projects — separate `config.yaml`, `schema.graphql`, and Postgres schema each. They do not share code or database state.

## Stack

- **Frontend:** React 19, TanStack Start, Three.js (`@react-three/fiber`) for the reveal sequence
- **Backend:** Bun, raw `Bun.serve` (no framework), Postgres
- **Indexing:** Envio HyperIndex, GraphQL via Hasura
- **Pricing:** GoldRush (Covalent)
- **Auth:** X OAuth 2.0

## Where to start

See each sub-project's own README for setup and environment variables:
- [`apps/web/README.md`](./apps/web/README.md)
- [`apps/api/README.md`](./apps/api/README.md)
- [`indexer-base/README.md`](./indexer-base/README.md)
- [`indexer-robinhood/README.md`](./indexer-robinhood/README.md)