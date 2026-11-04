const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Tests talk only to PGlite. A remote DATABASE_URL in the environment is a mistake. */
export function assertLocalDatabaseEnv(env: Record<string, string | undefined> = process.env): void {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
    const value = env[key];
    if (!value) continue;
    let host = "";
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`${key} is not a valid database URL. Tests only use PGlite.`);
    }
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`${key} points at ${host}. Tests only use PGlite and must not reach a remote database.`);
    }
  }
}
