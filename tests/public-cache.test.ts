import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { persons, trees } from "@/lib/db/schema";
import { linkPeople, updatePerson, updateUnion } from "@/lib/server/person-writes";
import { removePersonPhoto, savePersonPhoto } from "@/lib/server/photos";
import { getPublicTreeByTag, getTreeByCode } from "@/lib/server/public-tree";
import { approveSuggestion, createSuggestion } from "@/lib/server/suggestions";
import { createTree, regenerateShareCode, updateTreeSettings } from "@/lib/server/trees";
import type { SettingsInput } from "@/lib/validation";
import { withTestDatabase } from "./helpers/db";

const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);

const cases = [
  "private",
  "hide living",
  "socials off",
  "photos off",
  "old share code",
  "edited name",
  "public tag",
  "visible fields",
  "theme",
  "custom fields",
  "parent link",
  "union status",
  "suggestion approval",
  "photo removal",
] as const;

describe("public cache freshness", () => {
  it.each(cases)("the next read reflects %s", async (change) => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const tag = `cache-${change.replace(/ /g, "-")}`;
      await db.insert(user).values({ id: owner, name: "Owner", email: `${tag}@example.com`, emailVerified: true });
      const tree = await createTree(owner, `${tag}@example.com`, { name: "Cached" });
      const [root] = await db
        .insert(persons)
        .values({
          treeId: tree.id,
          firstName: "Ada",
          bio: "A long bio",
          email: "ada@example.com",
          hasPhoto: change === "photos off" || change === "photo removal",
        })
        .returning();
      if (change === "photo removal") {
        await savePersonPhoto(owner, root!.id, WEBP);
      }
      await updateTreeSettings(owner, tree.id, baseSettings(tag));
      if (change === "parent link" || change === "union status") {
        const [partner] = await db.insert(persons).values({ treeId: tree.id, firstName: "Bea", sex: "male" }).returning();
        await linkPeople(owner, tree.id, { kind: "spouse", personId: root!.id, otherId: partner!.id });
      }

      const before = await getPublicTreeByTag(tag, change);
      expect(before?.summary.name).toBe("Cached");

      if (change === "private") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), visibility: "private", publicTag: "" });
        expect(await getPublicTreeByTag(tag, `${change}-after`)).toBeNull();
        const [row] = await db.select({ shareCode: trees.shareCode }).from(trees).where(eq(trees.id, tree.id));
        expect(await getTreeByCode(row!.shareCode, `${change}-code`)).toBeNull();
        return;
      }
      if (change === "hide living") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), hideLivingDetails: true });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons[0]?.livingOnly).toBe(true);
        expect(after?.graph.persons[0]?.bio).toBeNull();
        expect(after?.graph.persons[0]?.firstName).toBe("Ada");
        return;
      }
      if (change === "socials off") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), socialsEnabled: false });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons[0]?.email).toBeNull();
        return;
      }
      if (change === "photos off") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), photosEnabled: false });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons[0]?.hasPhoto).toBe(false);
        expect(JSON.stringify(after)).not.toContain("/api/photos");
        return;
      }
      if (change === "old share code") {
        const [row] = await db.select({ shareCode: trees.shareCode }).from(trees).where(eq(trees.id, tree.id));
        const previous = row!.shareCode.trim();
        await getTreeByCode(previous, `${change}-before`);
        const next = await regenerateShareCode(owner, tree.id);
        expect(await getTreeByCode(previous, `${change}-old`)).toBeNull();
        expect((await getTreeByCode(next, `${change}-new`))?.summary.name).toBe("Cached");
        return;
      }
      if (change === "edited name") {
        await updatePerson(owner, tree.id, root!.id, { firstName: "Adelaide" });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons.map((person) => person.firstName)).toContain("Adelaide");
        return;
      }
      if (change === "public tag") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), publicTag: `${tag}-next` });
        expect(await getPublicTreeByTag(tag, `${change}-old`)).toBeNull();
        expect((await getPublicTreeByTag(`${tag}-next`, `${change}-new`))?.summary.publicTag).toBe(`${tag}-next`);
        return;
      }
      if (change === "visible fields") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), visibleFields: [] });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons[0]?.bio).toBeNull();
        return;
      }
      if (change === "theme") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), theme: "blueprint" });
        expect((await getPublicTreeByTag(tag, `${change}-after`))?.summary.theme).toBe("blueprint");
        return;
      }
      if (change === "custom fields") {
        await updateTreeSettings(owner, tree.id, {
          ...baseSettings(tag),
          customFieldDefs: [{ key: "clan", label: "Clan", type: "text" }],
        });
        expect((await getPublicTreeByTag(tag, `${change}-after`))?.summary.customFieldDefs).toEqual([
          { key: "clan", label: "Clan", type: "text" },
        ]);
        return;
      }
      if (change === "parent link") {
        const [child] = await db.insert(persons).values({ treeId: tree.id, firstName: "Cy" }).returning();
        await linkPeople(owner, tree.id, { kind: "child", parentId: root!.id, childId: child!.id, unionId: null });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons.map((person) => person.firstName)).toContain("Cy");
        expect(after?.graph.parentLinks.some((link) => link.parentId === root!.id && link.childId === child!.id)).toBe(true);
        return;
      }
      if (change === "union status") {
        const beforeUnion = before?.graph.unions[0];
        expect(beforeUnion).toBeTruthy();
        await updateUnion(owner, tree.id, beforeUnion!.id, { status: "divorced" });
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.unions.find((union) => union.id === beforeUnion!.id)?.status).toBe("divorced");
        return;
      }
      if (change === "suggestion approval") {
        await updateTreeSettings(owner, tree.id, { ...baseSettings(tag), allowSuggestions: true });
        const suggestion = await createSuggestion(owner, tree.id, {
          type: "new_person",
          targetPersonId: root!.id,
          payload: { firstName: "Dot", relation: "child" },
        });
        await approveSuggestion(owner, tree.id, suggestion.id);
        const after = await getPublicTreeByTag(tag, `${change}-after`);
        expect(after?.graph.persons.map((person) => person.firstName)).toContain("Dot");
        return;
      }
      await removePersonPhoto(owner, root!.id);
      const after = await getPublicTreeByTag(tag, `${change}-after`);
      expect(after?.graph.persons[0]?.hasPhoto).toBe(false);
      expect(after?.graph.persons[0]?.photoVersion).toBeNull();
    });
  });
});

function baseSettings(tag: string): SettingsInput {
  return {
    name: "Cached",
    description: "",
    visibility: "public",
    publicTag: tag,
    allowSuggestions: false,
    socialsEnabled: true,
    photosEnabled: true,
    hideLivingDetails: false,
    notifySuggestions: false,
    visibleFields: ["bio", "email"],
    theme: "sage-botanical",
    autosave: true,
    customFieldDefs: [],
  };
}
