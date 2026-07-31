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
};