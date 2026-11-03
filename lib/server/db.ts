import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "@/lib/db/schema";

export type AppDatabase = NeonDatabase<typeof schema>;

let neonDb: AppDatabase | undefined;
let testDb: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (process.env.VITEST) {
    if (!testDb) throw new Error("Test database is not initialized");
    return testDb;
  }

  if (!neonDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString });
    neonDb = drizzle({ client: pool, schema });
  }

  return neonDb;
}

export function setTestDb(db: AppDatabase | null): void {
  if (!process.env.VITEST) {
    throw new Error("setTestDb is only available in Vitest");
  }
  testDb = db;
}
