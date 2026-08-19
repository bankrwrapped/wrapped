function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error("Missing required environment variable: " + name);
  }
  return value;
}
export const env = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 4000,
  // Railway injects this automatically when you attach a Postgres service.
  DATABASE_URL: required("DATABASE_URL"),
  // GoldRush (Covalent) - primary historical price provider. Free tier,
  // 100k credits/month at 1 credit/call (unverified in real sustained
  // production volume - burst-tested clean to 10/sec, see Module 5 notes).
  GOLDRUSH_API_KEY: required("GOLDRUSH_API_KEY"),
  // Base RPC endpoint - used by decimalsService.ts for live on-chain
  // decimals lookups.
  BASE_RPC_URL: required("BASE_RPC_URL"),
  // Robinhood Chain RPC endpoint - used by decimalsService.ts for live
  // on-chain decimals lookups on chain=robinhood. Defaults to the public
  // endpoint (rate-limited, fine for our low call volume); override via
  // env if a dedicated provider is set up later.
  ROBINHOOD_RPC_URL: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  // Envio's GraphQL endpoints - each chain runs its own isolated Envio
  // instance (own DB, own indexed events), so each needs its own endpoint.
  // A single shared URL cannot serve both chains — see envioClient.ts.
  ENVIO_GRAPHQL_URL_BASE: required("ENVIO_GRAPHQL_URL_BASE"),
  ENVIO_GRAPHQL_URL_ROBINHOOD: required("ENVIO_GRAPHQL_URL_ROBINHOOD"),
  // Module 14: X OAuth 2.0 (Web App / confidential client, registered in
  // X's Developer Console). Client Secret is what makes it confidential -
  // required for the token exchange, unlike a public/SPA client.
  X_CLIENT_ID: required("X_CLIENT_ID"),
  X_CLIENT_SECRET: required("X_CLIENT_SECRET"),
  // Must exact-match a Callback URL registered in the X Developer Console -
  // https://wrapped-production.up.railway.app/auth/x/callback in production.
  X_REDIRECT_URI: required("X_REDIRECT_URI"),
  // 64-char hex (32 bytes) - generate with `openssl rand -hex 32`. Encrypts
  // refresh tokens at rest in the sessions table (see sessionCrypto.ts).
  SESSION_ENC_KEY: required("SESSION_ENC_KEY"),
};
