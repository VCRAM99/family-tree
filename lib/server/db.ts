import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { headers } from "next/headers";
import { after } from "next/server";
import ws from "ws";

import * as schema from "@/lib/db/schema";

export type AppDatabase = NeonDatabase<typeof schema>;

let neonDb: AppDatabase | undefined;
let testDb: AppDatabase | null = null;

type EgressBucket = {
  route: string;
  requests: number;
  queries: number;
  rows: number;
  bytes: number;
  largest: number;
  largestSql: string;
};

const requestBuckets = new Map<string, EgressBucket>();
const routeTotals = new Map<string, EgressBucket>();
const scheduled = new Set<string>();

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
    logDatabaseHost(connectionString);
    const pool = new Pool({ connectionString });
    if (process.env.NODE_ENV === "development") attachEgressProbe(pool);
    neonDb = drizzle({ client: pool, schema });
  }

  return neonDb;
}

let loggedDatabaseHost = false;

export function logDatabaseHost(connectionString = process.env.DATABASE_URL): void {
  if (loggedDatabaseHost || process.env.NODE_ENV === "production" || process.env.VITEST) return;
  if (!connectionString) return;
  loggedDatabaseHost = true;
  try {
    const host = new URL(connectionString).hostname;
    const visible = host.length > 7 ? `${host.slice(0, 7)}…` : host;
    console.info(`[db] connected to ${visible}`);
  } catch {
    console.info("[db] connected to an unreadable host");
  }
}

function attachEgressProbe(pool: Pool) {
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  pool.query = ((...args: unknown[]) =>
    original(...args).then((result) => {
      noteEgress(queryText(args[0]), result);
      return result;
    })) as Pool["query"];
}

function queryText(query: unknown): string {
  if (typeof query === "string") return query;
  if (query && typeof query === "object" && "text" in query) return String((query as { text: unknown }).text);
  return "";
}

function noteEgress(sqlText: string, result: unknown) {
  const rows = extractRows(result);
  void recordEgress(sqlText, rows.length, payloadBytes(rows));
}

async function recordEgress(sqlText: string, rows: number, bytes: number) {
  let route = "unknown";
  let requestId = "";
  try {
    const headerStore = await headers();
    const path = headerStore.get("x-pathname") ?? "unknown";
    const search = headerStore.get("x-search") ?? "";
    const method = headerStore.get("x-method") ?? "GET";
    route = `${method} ${path}${search}`;
    requestId = headerStore.get("x-request-id") ?? "";
  } catch {
    return;
  }
  if (!requestId) return;

  const current = requestBuckets.get(requestId) ?? {
    route,
    requests: 1,
    queries: 0,
    rows: 0,
    bytes: 0,
    largest: 0,
    largestSql: "",
  };
  current.queries += 1;
  current.rows += rows;
  current.bytes += bytes;
  if (bytes > current.largest) {
    current.largest = bytes;
    current.largestSql = sqlText;
  }
  requestBuckets.set(requestId, current);

  if (scheduled.has(requestId)) return;
  scheduled.add(requestId);
  const flush = () => {
    scheduled.delete(requestId);
    const bucket = requestBuckets.get(requestId);
    requestBuckets.delete(requestId);
    if (!bucket) return;
    const total = routeTotals.get(bucket.route) ?? {
      route: bucket.route,
      requests: 0,
      queries: 0,
      rows: 0,
      bytes: 0,
      largest: 0,
      largestSql: "",
    };
    total.requests += 1;
    total.queries += bucket.queries;
    total.rows += bucket.rows;
    total.bytes += bucket.bytes;
    routeTotals.set(bucket.route, total);
    const heavy = bucket.largest > 50_000 ? ` largest=${bucket.largest} ${compactSql(bucket.largestSql)}` : "";
    console.info(`[egress] ${bucket.route} queries=${bucket.queries} rows=${bucket.rows} bytes=${bucket.bytes}${heavy}`);
    printEgressSummary();
  };
  try {
    after(flush);
  } catch {
    flush();
  }
}

function printEgressSummary() {
  const ranked = [...routeTotals.values()].sort((a, b) => b.bytes - a.bytes);
  console.info("[egress:summary]");
  for (const bucket of ranked) {
    console.info(
      `  ${bucket.route} requests=${bucket.requests} queries=${bucket.queries} rows=${bucket.rows} bytes=${bucket.bytes}`,
    );
  }
}

function compactSql(sqlText: string): string {
  return sqlText.replace(/\s+/g, " ").slice(0, 140);
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

function payloadBytes(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (typeof value === "number" || typeof value === "boolean") return String(value).length;
  if (value instanceof Uint8Array) return value.byteLength;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + payloadBytes(item), 0);
  if (typeof value === "object") {
    let sum = 0;
    for (const [key, item] of Object.entries(value)) sum += key.length + payloadBytes(item);
    return sum;
  }
  return 0;
}

export function setTestDb(db: AppDatabase | null): void {
  if (!process.env.VITEST) {
    throw new Error("setTestDb is only available in Vitest");
  }
  testDb = db;
}
