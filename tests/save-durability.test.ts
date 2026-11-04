import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { persons } from "@/lib/db/schema";
import { createPersonWithRelation, updatePerson } from "@/lib/server/person-writes";
import { getTreeGraph } from "@/lib/server/tree-graph";
import { createTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

describe("save durability", () => {
  it("keeps a failed edit off the other fields and retries onto the same person", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "durability@example.com", emailVerified: true });
      const tree = await createTree(owner, "durability@example.com", { name: "Durability" });
      const created = await createPersonWithRelation(owner, tree.id, { firstName: "Ada" }, { kind: "root" });
      const personId = created.person!.id;
      await updatePerson(owner, tree.id, personId, { bio: "original" });
      await expect(
        updatePerson(owner, tree.id, personId, {
          birthDate: "2000-01-01",
          birthDatePrecision: "exact",
          deathDate: "1990-01-01",
          deathDatePrecision: "exact",
        }),
      ).rejects.toBeTruthy();
      const [row] = await db.select().from(persons).where(eq(persons.id, personId));
      expect(row?.bio).toBe("original");
      expect(row?.firstName).toBe("Ada");
      expect(row?.deathDate).toBeNull();

      await updatePerson(owner, tree.id, personId, { bio: "saved" });
      const graph = await getTreeGraph(tree.id, owner);
      expect(graph.persons.find((person) => person.id === personId)?.bio).toBe("saved");
    });
  });

  it("does not cross concurrent edits of two people", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "two@example.com", emailVerified: true });
      const tree = await createTree(owner, "two@example.com", { name: "Two" });
      const ada = await createPersonWithRelation(owner, tree.id, { firstName: "Ada" }, { kind: "root" });
      const bea = await createPersonWithRelation(owner, tree.id, { firstName: "Bea" }, { kind: "root" });
      await Promise.all([
        updatePerson(owner, tree.id, ada.person!.id, { bio: "Ada only" }),
        updatePerson(owner, tree.id, bea.person!.id, { bio: "Bea only" }),
      ]);
      const graph = await getTreeGraph(tree.id, owner);
      expect(graph.persons.find((person) => person.id === ada.person!.id)?.bio).toBe("Ada only");
      expect(graph.persons.find((person) => person.id === bea.person!.id)?.bio).toBe("Bea only");
    });
  });
});
