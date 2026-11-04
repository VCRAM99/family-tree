import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Local: npm run db:migrate (reads .env.local).
// Production, before or during a deploy to Neon main:
//   DATABASE_URL_UNPOOLED="postgres://..." npm run db:migrate:prod
// Use the unpooled Neon connection string. The host environment supplies it;
// this script does not load .env.local unless Node was started with --env-file.
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  console.error("DATABASE_URL_UNPOOLED is not set. For production, export the Neon unpooled URL and run npm run db:migrate:prod.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
} catch (err) {
  console.error("✗ migration failed:\n", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}