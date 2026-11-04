/**
 * Shared guard for scripts that open a database connection.
 * Prints the host and database name, and refuses protected hosts
 * unless --i-know-this-is-production was passed.
 */

export function databaseTarget(connectionString) {
  const url = new URL(connectionString);
  const database = url.pathname.replace(/^\//, "");
  return { host: url.hostname, database: database || "(none)" };
}

export function databaseTargetError(connectionString, options = {}) {
  let target;
  try {
    target = databaseTarget(connectionString);
  } catch {
    return "The database URL is not valid.";
  }
  const argv = options.argv ?? [];
  const acknowledged = argv.includes("--i-know-this-is-production");
  const lifecycle = options.lifecycle ?? "";
  if (lifecycle === "db:migrate:prod" && !acknowledged) {
    return "Refusing to run. db:migrate:prod requires --i-know-this-is-production.";
  }
  const protectedHosts = (options.protectedHosts ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (protectedHosts.includes(target.host.toLowerCase()) && !acknowledged) {
    return `Refusing to run against protected host ${target.host}. Pass --i-know-this-is-production if this is intentional.`;
  }
  return null;
}

export function assertSafeDatabaseTarget(connectionString) {
  const { host, database } = databaseTarget(connectionString);
  console.log(`[db] target host=${host} database=${database}`);
  const error = databaseTargetError(connectionString, {
    argv: process.argv,
    lifecycle: process.env.npm_lifecycle_event ?? "",
    protectedHosts: process.env.PROTECTED_DB_HOSTS ?? "",
  });
  if (error) {
    console.error(error);
    process.exit(1);
  }
}
