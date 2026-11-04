import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { persons, suggestions, trees } from "@/lib/db/schema";
import { createPersonWithRelation, deletePerson } from "@/lib/server/person-writes";
import { createSuggestion } from "@/lib/server/suggestions";
import { createTree, deleteTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

describe("data isolation", () => {
  it("deletes only the chosen person, tree, and account", async () => {
    await withTestDatabase(async (db) => {
      const ada = crypto.randomUUID();
      const bea = crypto.randomUUID();
      await db.insert(user).values([
        { id: ada, name: "Ada", email: "ada@example.com", emailVerified: true },
        { id: bea, name: "Bea", email: "bea@example.com", emailVerified: true },
      ]);
      const adaTree = await createTree(ada, "ada@example.com", { name: "Ada tree" });
      const beaTree = await createTree(bea, "bea@example.com", { name: "Bea tree" });
      const adaPerson = await createPersonWithRelation(ada, adaTree.id, { firstName: "Ada" }, { kind: "root" });
      const beaPerson = await createPersonWithRelation(bea, beaTree.id, { firstName: "Bea" }, { kind: "root" });
      await db.update(trees).set({ allowSuggestions: true }).where(eq(trees.id, beaTree.id));

      await deletePerson(ada, adaTree.id, adaPerson.person!.id);
      expect(await db.select().from(persons).where(eq(persons.treeId, beaTree.id))).toHaveLength(1);

      await deleteTree(ada, adaTree.id, "Ada tree");
      const [beaStill] = await db.select().from(trees).where(eq(trees.id, beaTree.id));
      expect(beaStill?.name).toBe("Bea tree");
      expect(await db.select().from(persons).where(eq(persons.id, beaPerson.person!.id))).toHaveLength(1);

      const adaAgain = await createTree(ada, "ada@example.com", { name: "Ada again" });
      await createPersonWithRelation(ada, adaAgain.id, { firstName: "Second" }, { kind: "root" });
      const adaSuggestion = await createSuggestion(ada, beaTree.id, {
        type: "new_person",
        targetPersonId: beaPerson.person!.id,
        payload: { firstName: "Guest", relation: "child" },
      });
      const beaSuggestion = await createSuggestion(bea, beaTree.id, {
        type: "correction",
        targetPersonId: beaPerson.person!.id,
        payload: { bio: "Kept" },
      });

      const { deleteAccountData } = await import("@/lib/server/account");
      await deleteAccountData({ id: ada, email: "ada@example.com" }, "ada@example.com");

      expect(await db.select().from(user).where(eq(user.id, ada))).toEqual([]);
      expect(await db.select().from(trees).where(eq(trees.ownerId, ada))).toEqual([]);
      expect(await db.select().from(suggestions).where(eq(suggestions.id, adaSuggestion.id))).toEqual([]);
      const [keptSuggestion] = await db.select().from(suggestions).where(eq(suggestions.id, beaSuggestion.id));
      expect(keptSuggestion?.payload).toMatchObject({ bio: "Kept" });
      const [keptTree] = await db.select().from(trees).where(eq(trees.id, beaTree.id));
      expect(keptTree?.name).toBe("Bea tree");
      expect(await db.select().from(persons).where(eq(persons.treeId, beaTree.id))).toHaveLength(1);
    });
  });
});
