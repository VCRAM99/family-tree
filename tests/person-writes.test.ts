import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { parentLinks, persons, treeAdmins, unions } from "@/lib/db/schema";
import { createPersonWithRelation, deletePerson, linkPeople, updateParentLink, updatePerson } from "@/lib/server/person-writes";
import { getTreeGraph } from "@/lib/server/tree-graph";
import { createTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

async function makeUser(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0], email: string) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: email, email });
  return id;
}

describe("person writes", () => {
  it("blocks signed-out and non-admin users, deletes links in one transaction, and rejects cross-tree links and cycles", async () => {
    await withTestDatabase(async (db) => {
      const owner = await makeUser(db, "owner@example.com");
      const stranger = await makeUser(db, "stranger@example.com");
      const tree = await createTree(owner, "owner@example.com", { name: "Kin" });
      const other = await createTree(owner, "owner@example.com", { name: "Other" });
      await db.insert(treeAdmins).values({
        treeId: tree.id,
        userId: stranger,
        invitedEmail: "stranger@example.com",
        role: "admin",
        status: "pending",
      });

      const denied = [null, stranger] as const;
      for (const actor of denied) {
        const code = actor ? "forbidden" : "unauthenticated";
        await expect(createPersonWithRelation(actor, tree.id, { firstName: "No" }, { kind: "root" })).rejects.toMatchObject({ code });
        await expect(updatePerson(actor, tree.id, crypto.randomUUID(), { firstName: "No" })).rejects.toMatchObject({ code });
        await expect(deletePerson(actor, tree.id, crypto.randomUUID())).rejects.toMatchObject({ code });
        await expect(
          linkPeople(actor, tree.id, { kind: "father", parentId: crypto.randomUUID(), childId: crypto.randomUUID() }),
        ).rejects.toMatchObject({ code });
        await expect(getTreeGraph(tree.id, actor)).rejects.toMatchObject({ code });
      }

      const parent = await createPersonWithRelation(owner, tree.id, { firstName: "Parent" }, { kind: "root" });
      const child = await createPersonWithRelation(owner, tree.id, { firstName: "Child", sex: "female" }, {
        kind: "child",
        parentId: parent.person!.id,
        unionId: null,
      });
      const spouse = await createPersonWithRelation(owner, tree.id, { firstName: "Spouse", sex: "male" }, {
        kind: "spouse",
        personId: parent.person!.id,
      });
      expect(child.parentLinks).toHaveLength(1);
      expect(spouse.unions[0]?.sortOrder).toBe(0);

      const outsider = await createPersonWithRelation(owner, other.id, { firstName: "Outsider" }, { kind: "root" });
      await expect(
        linkPeople(owner, tree.id, { kind: "father", parentId: outsider.person!.id, childId: child.person!.id }),
      ).rejects.toThrow(/not in this tree/i);

      await expect(
        linkPeople(owner, tree.id, { kind: "child", parentId: child.person!.id, childId: parent.person!.id, unionId: null }),
      ).rejects.toThrow("That would make someone their own ancestor");

      const graph = await getTreeGraph(tree.id, owner);
      expect(graph.persons.map((person) => person.firstName).sort()).toEqual(["Child", "Parent", "Spouse"]);
      expect(graph.parentLinks).toHaveLength(1);
      expect(graph.unions).toHaveLength(1);

      const removed = await deletePerson(owner, tree.id, parent.person!.id);
      expect(removed.nextPersonId).toBeTruthy();
      expect(await db.select().from(parentLinks).where(eq(parentLinks.treeId, tree.id))).toEqual([]);
      expect(await db.select().from(unions).where(eq(unions.treeId, tree.id))).toEqual([]);
      const remaining = await db.select().from(persons).where(eq(persons.treeId, tree.id));
      expect(remaining.map((person) => person.firstName).sort()).toEqual(["Child", "Spouse"]);

      const again = await createPersonWithRelation(owner, tree.id, { firstName: "Parent" }, { kind: "root" });
      await createPersonWithRelation(owner, tree.id, { firstName: "Child", sex: "female" }, {
        kind: "child",
        parentId: again.person!.id,
        unionId: null,
      });
      const original = db.transaction.bind(db);
      db.transaction = (async (callback) =>
        original(async (tx) => {
          let deletes = 0;
          const wrapped = new Proxy(tx, {
            get(target, prop, receiver) {
              if (prop === "delete") {
                return (...args: unknown[]) => {
                  deletes += 1;
                  if (deletes === 3) throw new Error("stop before commit");
                  return Reflect.apply(Reflect.get(target, prop, receiver) as (...inner: unknown[]) => unknown, target, args);
                };
              }
              const value = Reflect.get(target, prop, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          return callback(wrapped as typeof tx);
        })) as typeof db.transaction;
      await expect(deletePerson(owner, tree.id, again.person!.id)).rejects.toThrow(/stop before commit/);
      db.transaction = original;
      const links = await db.select().from(parentLinks).where(eq(parentLinks.treeId, tree.id));
      expect(links).toHaveLength(1);
      const stillThere = await db.select().from(persons).where(eq(persons.id, again.person!.id));
      expect(stillThere).toHaveLength(1);
    });
  });

  it("rejects a death date before birth", async () => {
    await withTestDatabase(async (db) => {
      const owner = await makeUser(db, "owner@example.com");
      const tree = await createTree(owner, "owner@example.com", { name: "Dates" });
      const created = await createPersonWithRelation(owner, tree.id, { firstName: "Ada" }, { kind: "root" });
      await expect(
        updatePerson(owner, tree.id, created.person!.id, {
          birthDate: "1950-01-02",
          birthDatePrecision: "exact",
          deathDate: "1940-01-02",
          deathDatePrecision: "exact",
        }),
      ).rejects.toThrow(/earlier than the birth date/);
    });
  });

  it("unions the second parent, copies every sibling link, and gives a child the only spouse", async () => {
    await withTestDatabase(async (db) => {
      const owner = await makeUser(db, "owner@example.com");
      const tree = await createTree(owner, "owner@example.com", { name: "Unions" });
      const mom = await createPersonWithRelation(owner, tree.id, { firstName: "Mom", sex: "female" }, { kind: "root" });
      const child = await createPersonWithRelation(owner, tree.id, { firstName: "Child" }, {
        kind: "child",
        parentId: mom.person!.id,
        unionId: null,
      });
      const momLink = child.parentLinks[0];
      if (!momLink) throw new Error("missing link");
      await updateParentLink(owner, tree.id, momLink.id, "adoptive");
      const sibling = await createPersonWithRelation(owner, tree.id, { firstName: "Sibling" }, { kind: "sibling", personId: child.person!.id });
      expect(sibling.parentLinks.map((link) => ({ parentId: link.parentId, kind: link.kind, unionId: link.unionId }))).toEqual([
        { parentId: mom.person!.id, kind: "adoptive", unionId: null },
      ]);

      const dad = await createPersonWithRelation(owner, tree.id, { firstName: "Dad", sex: "male" }, {
        kind: "father",
        childId: child.person!.id,
        alsoSiblings: true,
      });
      expect(dad.unions).toHaveLength(1);
      const unionId = dad.unions[0]?.id;
      expect(dad.parentLinks.every((link) => link.unionId === unionId)).toBe(true);
      expect([...new Set(dad.parentLinks.map((link) => link.childId))].sort()).toEqual([child.person!.id, sibling.person!.id].sort());

      const rows = await db.select().from(parentLinks).where(eq(parentLinks.treeId, tree.id));
      expect(rows.every((link) => link.unionId === unionId)).toBe(true);

      const spouse = await createPersonWithRelation(owner, tree.id, { firstName: "Spouse", sex: "female" }, {
        kind: "spouse",
        personId: dad.person!.id,
      });
      expect(spouse.unions).toHaveLength(1);
      const baby = await createPersonWithRelation(owner, tree.id, { firstName: "Baby" }, {
        kind: "child",
        parentId: dad.person!.id,
        unionId: spouse.unions[0]!.id,
      });
      expect(baby.parentLinks.map((link) => link.parentId).sort()).toEqual([dad.person!.id, spouse.person!.id].sort());
      expect(baby.parentLinks.every((link) => link.unionId === spouse.unions[0]?.id)).toBe(true);

      const lone = await createPersonWithRelation(owner, tree.id, { firstName: "Lone" }, { kind: "child", parentId: mom.person!.id, unionId: null });
      const skipped = await linkPeople(owner, tree.id, { kind: "father", parentId: dad.person!.id, childId: lone.person!.id, alsoSiblings: false });
      expect([...new Set(skipped.parentLinks.map((link) => link.childId))]).toEqual([lone.person!.id]);
    });
  });

  it("adds a sibling with no parents through one placeholder, then replaces that parent in one transaction", async () => {
    await withTestDatabase(async (db) => {
      const owner = await makeUser(db, "sib@example.com");
      const tree = await createTree(owner, "sib@example.com", { name: "Siblings" });
      const one = await createPersonWithRelation(owner, tree.id, { firstName: "One" }, { kind: "root" });
      const two = await createPersonWithRelation(owner, tree.id, { firstName: "Two" }, { kind: "sibling", personId: one.person!.id });
      const placeholder = two.persons?.[0];
      expect(placeholder?.isPlaceholder).toBe(true);
      const created = await db.select().from(parentLinks).where(eq(parentLinks.treeId, tree.id));
      expect(created.map((link) => link.parentId)).toEqual([placeholder!.id, placeholder!.id]);
      expect(created.map((link) => link.childId).sort()).toEqual([one.person!.id, two.person!.id].sort());

      const dad = await createPersonWithRelation(owner, tree.id, { firstName: "Dad", sex: "male" }, {
        kind: "father",
        childId: one.person!.id,
        replacePlaceholder: true,
      });
      expect(dad.removedPersonIds).toEqual([placeholder!.id]);
      const people = await db.select().from(persons).where(eq(persons.treeId, tree.id));
      expect(people.some((person) => person.id === placeholder!.id)).toBe(false);
      const after = await db.select().from(parentLinks).where(eq(parentLinks.treeId, tree.id));
      expect(after.every((link) => link.parentId === dad.person!.id)).toBe(true);
      expect(after.map((link) => link.childId).sort()).toEqual([one.person!.id, two.person!.id].sort());
    });
  });
});
