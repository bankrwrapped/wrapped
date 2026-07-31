import { SQL } from "bun";
import { env } from "../config/env";

// Bun's built-in Postgres client (native since Bun 1.2 - no npm dependency
// needed). Works directly with Railway's DATABASE_URL connection string.
export const db = new SQL(env.DATABASE_URL);