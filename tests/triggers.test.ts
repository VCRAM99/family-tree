import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { parentLinks, persons, trees, unions, user } from "@/lib/db/schema";
import { generateShareCode } from "@/lib/share-code";

import { withTestDatabase } from "./helpers/db";

async function insertUser(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0], email: string) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: email, email });
  return id;
}

async function insertTree(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0], ownerId: string, name: string) {
  const [tree] = await db
    .insert(trees)
    .values({ ownerId, name, shareCode: generateShareCode() })
    .returning();
  if (!tree) throw new Error("tree missing");
  return tree;
}

async function insertPerson(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0], treeId: string, firstName: string) {
  const [person] = await db.insert(persons).values({ treeId, firstName }).returning();
  if (!person) throw new Error("person missing");
  return person;
}

async function expectDatabaseRejection(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (error) {
    const text = collectErrorText(error);
    if (!pattern.test(text)) {
      throw new Error(`expected ${pattern}, received:\n${text}`);
    }
    return;
  }
  throw new Error(`expected ${pattern}, but the query succeeded`);
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("message" in current && typeof current.message === "string") parts.push(current.message);
    current = "cause" in current ? current.cause : undefined;
  }
  return parts.join("\n");
}

describe("relationship integrity", () => {
  it("rejects ancestry cycles and allows cousin marriage plus multiple unions", async () => {
    await withTestDatabase(async (db) => {
      const ownerId = await insertUser(db, "owner@example.com");
      const tree = await insertTree(db, ownerId, "Kin");
      const grandparent = await insertPerson(db, tree.id, "Grand");
      const parentA = await insertPerson(db, tree.id, "Parent A");
      const parentB = await insertPerson(db, tree.id, "Parent B");
      const cousinA = await insertPerson(db, tree.id, "Cousin A");
      const cousinB = await insertPerson(db, tree.id, "Cousin B");

      await db.insert(parentLinks).values([
        { treeId: tree.id, parentId: grandparent.id, childId: parentA.id },
        { treeId: tree.id, parentId: grandparent.id, childId: parentB.id },
        { treeId: tree.id, parentId: parentA.id, childId: cousinA.id },
        { treeId: tree.id, parentId: parentB.id, childId: cousinB.id },
      ]);

      await expectDatabaseRejection(
        db.insert(parentLinks).values({ treeId: tree.id, parentId: parentA.id, childId: grandparent.id }),
        /ancestor/i,
      );

      await expectDatabaseRejection(
        db.insert(parentLinks).values({ treeId: tree.id, parentId: cousinA.id, childId: grandparent.id }),
        /ancestor/i,
      );

      await db.insert(unions).values({
        treeId: tree.id,
        personAId: cousinA.id,
        personBId: cousinB.id,
        status: "married",
      });
      await db.insert(unions).values({
        treeId: tree.id,
        personAId: parentA.id,
        personBId: parentB.id,
        status: "partner",
      });
      await db.insert(unions).values({
        treeId: tree.id,
        personAId: parentA.id,
        personBId: cousinA.id,
        status: "married",
      });
      await db.insert(unions).values({
        treeId: tree.id,
        personAId: cousinA.id,
        personBId: cousinB.id,
        status: "divorced",
        sortOrder: 1,
      });

      const couple = await db.select().from(unions).where(eq(unions.treeId, tree.id));
      expect(couple).toHaveLength(4);
    });
  });

  it("rejects parent links and unions that cross trees", async () => {
    await withTestDatabase(async (db) => {
      const ownerId = await insertUser(db, "owner@example.com");
      const first = await insertTree(db, ownerId, "First");
      const second = await insertTree(db, ownerId, "Second");
      const local = await insertPerson(db, first.id, "Local");
      const other = await insertPerson(db, second.id, "Other");
      const alsoLocal = await insertPerson(db, first.id, "Also");

      await expectDatabaseRejection(
        db.insert(parentLinks).values({ treeId: first.id, parentId: local.id, childId: other.id }),
        /same tree/i,
      );

      await expectDatabaseRejection(
        db.insert(unions).values({ treeId: first.id, personAId: local.id, personBId: other.id }),
        /same tree/i,
      );

      await db.insert(parentLinks).values({ treeId: first.id, parentId: local.id, childId: alsoLocal.id });
      const links = await db.select().from(parentLinks);
      expect(links).toHaveLength(1);
    });
  });
});
