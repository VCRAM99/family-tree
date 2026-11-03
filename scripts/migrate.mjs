import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });

try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
} catch (err) {
  console.error("✗ migration failed:\n", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}