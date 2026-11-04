import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import { assertSafeDatabaseTarget } from "./db-guard.mjs";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is not set.");
  process.exit(1);
}
assertSafeDatabaseTarget(connectionString);

const tables = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
  "trees",
  "tree_admins",
  "persons",
  "person_photos",
  "parent_links",
  "unions",
  "suggestions",
  "viewer_identities",
  "lookup_buckets",
];

function cell(value) {
  if (value instanceof Uint8Array) return { base64: Buffer.from(value).toString("base64") };
  if (value instanceof Date) return value.toISOString();
  return value;
}

const pool = new pg.Pool({ connectionString });
try {
  const backup = { createdAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const result = await pool.query(`select * from "${table}"`);
    backup.tables[table] = result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cell(value)])));
    console.log(`${table}: ${result.rowCount ?? result.rows.length}`);
  }
  const stamp = backup.createdAt.replace(/[:.]/g, "-");
  const directory = path.join(process.cwd(), "backups");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `family-tree-${stamp}.json`);
  await writeFile(file, JSON.stringify(backup));
  console.log(`Wrote ${file}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
