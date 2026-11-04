import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { parentLinks, persons, trees, unions } from "@/lib/db/schema";
import { createPersonWithRelation, linkPeople } from "@/lib/server/person-writes";
import { exportTree, importTree } from "@/lib/server/tree-export";
import { createTree, updateTreeSettings } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

describe("tree export", () => {
  it("imports a new tree with the same graph and leaves the original untouched", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "export@example.com", emailVerified: true });
      const original = await createTree(owner, "export@example.com", { name: "Exported", description: "Notes" });
      await updateTreeSettings(owner, original.id, {
        name: "Exported",
        description: "Notes",
        visibility: "private",
        publicTag: "",
        allowSuggestions: true,
        socialsEnabled: true,
        photosEnabled: false,
        hideLivingDetails: false,
        notifySuggestions: false,
        visibleFields: ["bio"],
        theme: "sepia-archive",
        customFieldDefs: [{ key: "clan", label: "Clan", type: "text" }],
      });
      const ada = await createPersonWithRelation(owner, original.id, { firstName: "Ada", sex: "female" }, { kind: "root" });
      const bea = await createPersonWithRelation(
        owner,
        original.id,
        { firstName: "Bea", sex: "male" },
        { kind: "spouse", personId: ada.person!.id },
      );
      await createPersonWithRelation(owner, original.id, { firstName: "Cy" }, { kind: "child", parentId: ada.person!.id, unionId: bea.unions[0]?.id ?? null });
      await linkPeople(owner, original.id, { kind: "father", parentId: bea.person!.id, childId: (await db.select().from(persons).where(eq(persons.firstName, "Cy")))[0]!.id, alsoSiblings: true, replacePlaceholder: true });

      const file = await exportTree(owner, original.id);
      const created = await importTree(owner, "export@example.com", file);

      expect(created.id).not.toBe(original.id);
      const [still] = await db.select().from(trees).where(eq(trees.id, original.id));
      expect(still?.name).toBe("Exported");
      expect(await db.select().from(persons).where(eq(persons.treeId, original.id))).toHaveLength(3);

      const [copy] = await db.select().from(trees).where(eq(trees.id, created.id));
      expect(copy?.name).toBe("Exported");
      expect(copy?.description).toBe("Notes");
      expect(copy?.visibility).toBe("private");
      expect(copy?.publicTag).toBeNull();
      expect(copy?.theme).toBe("sepia-archive");
      expect(copy?.shareCode).not.toBe(still?.shareCode);
      expect(copy?.hideLivingDetails).toBe(false);
      expect(copy?.customFieldDefs).toEqual([{ key: "clan", label: "Clan", type: "text" }]);

      const copyPeople = await db.select().from(persons).where(eq(persons.treeId, created.id));
      expect(copyPeople.map((person) => person.firstName).sort()).toEqual(["Ada", "Bea", "Cy"]);
      const byName = new Map(copyPeople.map((person) => [person.firstName, person.id]));
      const links = await db.select().from(parentLinks).where(eq(parentLinks.treeId, created.id));
      const linkNames = links
        .map((link) => `${copyPeople.find((person) => person.id === link.parentId)?.firstName}->${copyPeople.find((person) => person.id === link.childId)?.firstName}`)
        .sort();
      expect(linkNames).toEqual(["Ada->Cy", "Bea->Cy"]);
      const pairings = await db.select().from(unions).where(eq(unions.treeId, created.id));
      expect(pairings).toHaveLength(1);
      expect(new Set([byName.get("Ada"), byName.get("Bea")])).toEqual(new Set([pairings[0]?.personAId, pairings[0]?.personBId]));
    });
  });
});
