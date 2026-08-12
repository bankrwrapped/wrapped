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
  // Envio's GraphQL endpoint - read path for envioClient.ts's indexed
  // Swap/Release/Collect event queries.
  ENVIO_GRAPHQL_URL: required("ENVIO_GRAPHQL_URL"),
};
