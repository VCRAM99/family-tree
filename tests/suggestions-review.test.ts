import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { parentLinks, persons, suggestions, treeAdmins, trees } from "@/lib/db/schema";
import { createPerson } from "@/lib/server/persons";
import { approveSuggestion, createSuggestion, rejectSuggestion } from "@/lib/server/suggestions";
import { createTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

const rejected = [
  { name: "signed-out", actor: "signedOut" as const, allow: false, socials: true, suggestionsOn: true, type: "new_person" as const },
  { name: "suggestions off", actor: "member" as const, allow: false, socials: true, suggestionsOn: false, type: "new_person" as const },
  { name: "contact while socials off", actor: "member" as const, allow: false, socials: false, suggestionsOn: true, type: "contact_update" as const },
];

describe("suggestion permissions", () => {
  it.each(rejected)("$name is rejected", async ({ actor, allow, socials, suggestionsOn, type }) => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const member = crypto.randomUUID();
      await db.insert(user).values([
        { id: owner, name: "Owner", email: "s-owner@example.com", emailVerified: true },
        { id: member, name: "Member", email: "s-member@example.com", emailVerified: true },
      ]);
      const tree = await createTree(owner, "s-owner@example.com", { name: "Suggest" });
      const person = await createPerson(owner, tree.id, { firstName: "Root" });
      await db.update(trees).set({ allowSuggestions: suggestionsOn, socialsEnabled: socials }).where(eq(trees.id, tree.id));
      const userId = actor === "signedOut" ? null : member;
      const input = {
        type,
        targetPersonId: person.id,
        payload: type === "contact_update" ? { email: "me@example.com" } : { firstName: "New", relation: "child" },
      };
      if (allow) await expect(createSuggestion(userId, tree.id, input)).resolves.toMatchObject({ status: "pending" });
      else await expect(createSuggestion(userId, tree.id, input)).rejects.toBeTruthy();
    });
  });

  it("enforces 20 suggestions per person per tree each day", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const member = crypto.randomUUID();
      await db.insert(user).values([
        { id: owner, name: "Owner", email: "rate-owner@example.com", emailVerified: true },
        { id: member, name: "Member", email: "rate-member@example.com", emailVerified: true },
      ]);
      const tree = await createTree(owner, "rate-owner@example.com", { name: "Rate" });
      await db.update(trees).set({ allowSuggestions: true }).where(eq(trees.id, tree.id));
      for (let index = 0; index < 20; index += 1) {
        await createSuggestion(member, tree.id, { type: "new_person", payload: { firstName: `N${index}` } });
      }
      await expect(createSuggestion(member, tree.id, { type: "new_person", payload: { firstName: "Too many" } })).rejects.toMatchObject({
        code: "forbidden",
      });
    });
  });

  it("approves a new person and their link in one transaction, and leaves a bad correction pending", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "apply-owner@example.com", emailVerified: true });
      const tree = await createTree(owner, "apply-owner@example.com", { name: "Apply" });
      await db.update(trees).set({ allowSuggestions: true }).where(eq(trees.id, tree.id));
      const root = await createPerson(owner, tree.id, { firstName: "Root" });
      await db
        .update(persons)
        .set({ birthDate: "1980-01-01", birthDatePrecision: "exact" })
        .where(eq(persons.id, root.id));
      const created = await createSuggestion(owner, tree.id, {
        type: "new_person",
        targetPersonId: root.id,
        payload: { firstName: "Child", relation: "child" },
      });
      await approveSuggestion(owner, tree.id, created.id);
      const people = await db.select().from(persons).where(eq(persons.treeId, tree.id));
      expect(people.map((person) => person.firstName).sort()).toEqual(["Child", "Root"]);
      const links = await db.select().from(parentLinks).where(eq(parentLinks.treeId, tree.id));
      expect(links).toHaveLength(1);
      const [approved] = await db.select().from(suggestions).where(eq(suggestions.id, created.id));
      expect(approved?.status).toBe("approved");

      const bad = await createSuggestion(owner, tree.id, {
        type: "correction",
        targetPersonId: root.id,
        payload: { patch: { deathDate: "1970-01-01", deathDatePrecision: "exact", isDeceased: true } },
      });
      await expect(approveSuggestion(owner, tree.id, bad.id)).rejects.toBeTruthy();
      const [still] = await db.select().from(persons).where(eq(persons.id, root.id));
      expect(still?.deathDate).toBeNull();
      const [pending] = await db.select().from(suggestions).where(eq(suggestions.id, bad.id));
      expect(pending?.status).toBe("pending");
    });
  });

  it.each([
    { actor: "owner", allow: true },
    { actor: "admin", allow: true },
    { actor: "stranger", allow: false },
  ] as const)("review by $actor is allowed=$allow", async ({ actor, allow }) => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const admin = crypto.randomUUID();
      const stranger = crypto.randomUUID();
      await db.insert(user).values([
        { id: owner, name: "Owner", email: `rev-owner-${actor}@example.com`, emailVerified: true },
        { id: admin, name: "Admin", email: `rev-admin-${actor}@example.com`, emailVerified: true },
        { id: stranger, name: "Stranger", email: `rev-stranger-${actor}@example.com`, emailVerified: true },
      ]);
      const tree = await createTree(owner, `rev-owner-${actor}@example.com`, { name: "Review" });
      await db.insert(treeAdmins).values({
        treeId: tree.id,
        userId: admin,
        invitedEmail: `rev-admin-${actor}@example.com`,
        role: "admin",
        status: "accepted",
      });
      await db.update(trees).set({ allowSuggestions: true }).where(eq(trees.id, tree.id));
      const row = await createSuggestion(owner, tree.id, { type: "new_person", payload: { firstName: "Later" } });
      const userId = actor === "owner" ? owner : actor === "admin" ? admin : stranger;
      if (allow) await expect(rejectSuggestion(userId, tree.id, row.id)).resolves.toMatchObject({ status: "rejected" });
      else await expect(rejectSuggestion(userId, tree.id, row.id)).rejects.toMatchObject({ code: "forbidden" });
    });
  });
});
