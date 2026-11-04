export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertServerEnv } = await import("./lib/env");
  assertServerEnv();
  const { logDatabaseHost } = await import("./lib/server/db");
  logDatabaseHost();
}
