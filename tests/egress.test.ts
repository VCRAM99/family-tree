import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import * as schema from "@/lib/db/schema";
import { persons, trees } from "@/lib/db/schema";
import { updatePerson } from "@/lib/server/person-writes";
import { createPostgresPhotoStorage } from "@/lib/server/photo-storage";
import { loadCachedPublicTree } from "@/lib/server/public-tree";
import { setTestDb, type AppDatabase } from "@/lib/server/db";
import { getTreeGraph } from "@/lib/server/tree-graph";
import { createTree } from "@/lib/server/trees";
import { PHOTO_MIME } from "@/lib/photos";

const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);

async function withLoggedDb<T>(run: (db: AppDatabase, queries: string[]) => Promise<T>): Promise<T> {
  const queries: string[] = [];
  const client = new PGlite();
  const db = drizzle({
    client,
    schema,
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  });
  await migrate(db, { migrationsFolder: "drizzle" });
  setTestDb(db as unknown as AppDatabase);
  try {
    return await run(db as unknown as AppDatabase, queries);
  } finally {
    setTestDb(null);
    await client.close();
  }
}

function mentionsPhotoBytes(sqlText: string): boolean {
  return /person_photos[\s\S]{0,120}\bbytes\b|\bbytes\b[\s\S]{0,80}person_photos|"bytes"/i.test(sqlText);
}

describe("egress", () => {
  it("loads the graph and a person without photo bytes", async () => {
    await withLoggedDb(async (db, queries) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "egress@example.com", emailVerified: true });
      const tree = await createTree(owner, "egress@example.com", { name: "Egress" });
      const [person] = await db.insert(persons).values({ treeId: tree.id, firstName: "Ada", bio: "A".repeat(80) }).returning();
      await createPostgresPhotoStorage(db).put(person!.id, { bytes: WEBP, mime: PHOTO_MIME, sizeBytes: WEBP.byteLength });

      queries.length = 0;
      const graph = await getTreeGraph(tree.id, owner);
      expect(graph.persons).toHaveLength(1);
      expect(graph.persons[0]?.photoVersion).toBeTruthy();
      const graphSql = queries.join("\n");
      expect(mentionsPhotoBytes(graphSql)).toBe(false);
      expect(graphSql).toContain("person_photos");
      expect(graphSql).not.toMatch(/\bbytes\b/);

      queries.length = 0;
      const storage = createPostgresPhotoStorage(db);
      const meta = await storage.stat(person!.id);
      expect(meta?.sizeBytes).toBe(WEBP.byteLength);
      expect(queries.join("\n")).not.toMatch(/\bbytes\b/);
      queries.length = 0;
      const photo = await storage.get(person!.id);
      expect(photo?.bytes.byteLength).toBe(WEBP.byteLength);
      expect(queries.join("\n")).toMatch(/\bbytes\b/);
    });
  });

  it("saves one person without a graph-wide query", async () => {
    await withLoggedDb(async (db, queries) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "save@example.com", emailVerified: true });
      const tree = await createTree(owner, "save@example.com", { name: "Save" });
      const [person] = await db.insert(persons).values({ treeId: tree.id, firstName: "Ada" }).returning();
      queries.length = 0;
      const saved = await updatePerson(owner, tree.id, person!.id, { bio: "Edited" });
      expect(saved.bio).toBe("Edited");
      const sqlText = queries.join("\n");
      expect(sqlText).not.toMatch(/json_agg/);
      expect(sqlText).not.toMatch(/\bbytes\b/);
      expect(sqlText).not.toMatch(/person_photos/);
      const personScans = queries.filter((query) => /from "persons"/i.test(query) && !/limit/i.test(query));
      expect(personScans).toEqual([]);
    });
  });

  it("serves a second public view from cache with zero queries", async () => {
    await withLoggedDb(async (db, queries) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "public@example.com", emailVerified: true });
      const tree = await createTree(owner, "public@example.com", { name: "Public" });
      await db.update(trees).set({ visibility: "public", publicTag: "egress-public" }).where(eq(trees.id, tree.id));
      await db.insert(persons).values({ treeId: tree.id, firstName: "Ada" });

      queries.length = 0;
      const first = await loadCachedPublicTree(tree.id);
      expect(first?.graph.persons).toHaveLength(1);
      expect(queries.length).toBeGreaterThan(0);

      queries.length = 0;
      const second = await loadCachedPublicTree(tree.id);
      expect(second?.summary.name).toBe("Public");
      expect(queries).toEqual([]);
    });
  });

  it("measures a 200-person graph so a 2,000-person tree can be extrapolated", async () => {
    await withLoggedDb(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "size@example.com", emailVerified: true });
      const tree = await createTree(owner, "size@example.com", { name: "Size" });
      const bio = "Lived in the same village and kept the family records.".padEnd(180, ".");
      await db.insert(persons).values(
        Array.from({ length: 200 }, (_, index) => ({
          treeId: tree.id,
          firstName: `Person${index}`,
          lastName: "Family",
          bio,
          birthPlace: "Sampletown",
          occupation: "Teacher",
        })),
      );
      const graph = await getTreeGraph(tree.id, owner);
      const bytes = Buffer.byteLength(JSON.stringify(graph));
      console.info(`egress sample: 200 people ${bytes} bytes; x10 ≈ ${bytes * 10} bytes for 2,000`);
      expect(graph.persons).toHaveLength(200);
      expect(bytes).toBeGreaterThan(10_000);
      expect(bytes).toBeLessThan(2_000_000);
    });
  });
});
