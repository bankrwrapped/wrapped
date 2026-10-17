// Fixed values for config/env.ts's variables, so modules that import it can
// load in tests. Import this FIRST in every test file.
//
// These OVERWRITE whatever is set: Bun auto-loads apps/api/.env, which holds
// real production URLs and keys - a test must never reach the real DB,
// Envio or GoldRush. The test script also runs with --no-env-file; this is
// the second guard. DB-backed tests opt in via TEST_DATABASE_URL instead.
const fixed: Record<string, string> = {
  DATABASE_URL: process.env.TEST_DATABASE_URL || "postgres://test@localhost:1/unused",
  GOLDRUSH_API_KEY: "test-goldrush",
  BASE_RPC_URL: "http://base-rpc.test",
  ROBINHOOD_RPC_URL: "http://robinhood-rpc.test",
  ENVIO_GRAPHQL_URL_BASE: "http://envio-base.test/v1/graphql",
  ENVIO_GRAPHQL_URL_ROBINHOOD: "http://envio-robinhood.test/v1/graphql",
  X_CLIENT_ID: "test-client",
  X_CLIENT_SECRET: "test-secret",
  X_REDIRECT_URI: "https://bankrwrapped.com/auth/x/callback",
  SESSION_ENC_KEY: "11".repeat(32),
};
for (const [k, v] of Object.entries(fixed)) process.env[k] = v;
delete process.env.WRAPPED_WEBHOOK_SECRET;
