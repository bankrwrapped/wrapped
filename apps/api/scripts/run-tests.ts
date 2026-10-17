// Runs every src/**/*.test.ts in its OWN `bun test` process.
//
// Why not one `bun test src`: these tests replace modules with
// mock.module(), and Bun's module mocks are process-wide - a file that mocks
// a repository would leak that mock into every later file in the same run.
//
// --no-env-file: Bun otherwise auto-loads apps/api/.env, which holds REAL
// production URLs/keys. Tests must never reach them (src/test/setupEnv.ts
// is the second guard).
//
// DB-backed tests (*.db.test.ts) only run when TEST_DATABASE_URL points at a
// throwaway Postgres; they're skipped otherwise.
import { Glob } from "bun";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const files = [...new Glob("src/**/*.test.ts").scanSync({ cwd: root })].sort();
const failed: string[] = [];

for (const file of files) {
  const proc = Bun.spawnSync(["bun", "--no-env-file", "test", `./${file}`], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) failed.push(file);
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
if (!process.env.TEST_DATABASE_URL) {
  console.log("(DB tests skipped - set TEST_DATABASE_URL to a throwaway Postgres to run them)");
}
if (failed.length > 0) {
  console.log("FAILED:\n  " + failed.join("\n  "));
  process.exit(1);
}
