import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/lib/db/schema";
import { setTestDb, type AppDatabase } from "@/lib/server/db";

export async function withTestDatabase<T>(run: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>): Promise<T> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  setTestDb(db as unknown as AppDatabase);
  try {
    return await run(db);
  } finally {
    setTestDb(null);
    await client.close();
  }
}
