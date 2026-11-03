import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { persons, treeAdmins, trees } from "@/lib/db/schema";
import { user } from "@/lib/db/auth-schema";
import { createPerson } from "@/lib/server/persons";
import { createSuggestion } from "@/lib/server/suggestions";
import { readViewerIdentity, setViewerIdentity } from "@/lib/server/viewer-identity";
import {
  changeTreeVisibility,
  createTree,
  deleteTree,
  inviteTreeAdmin,
  readTree,
} from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

describe("authorization", () => {
  it("enforces the owner, admin, pending, stranger, and signed-out matrix", async () => {
    await withTestDatabase(async (db) => {
      async function makeUser(email: string) {
        const id = crypto.randomUUID();
        await db.insert(user).values({ id, name: email, email });
        return id;
      }

      const owner = await makeUser("owner@example.com");
      const admin = await makeUser("admin@example.com");
      const pending = await makeUser("pending@example.com");
      const stranger = await makeUser("stranger@example.com");
      const tree = await createTree(owner, "owner@example.com", { name: "Ramanathan" });
      await db.insert(treeAdmins).values({
        treeId: tree.id,
        userId: admin,
        invitedEmail: "admin@example.com",
        role: "admin",
        status: "accepted",
      });
      await db.insert(treeAdmins).values({
        treeId: tree.id,
        userId: pending,
        invitedEmail: "pending@example.com",
        role: "admin",
        status: "pending",
      });
      await db.update(trees).set({ allowSuggestions: true }).where(eq(trees.id, tree.id));

      const actors = {
        owner,
        admin,
        pending,
        stranger,
        signedOut: null,
      } as const;

      const readCodes = {
        owner: "ok",
        admin: "ok",
        pending: "forbidden",
        stranger: "forbidden",
        signedOut: "unauthenticated",
      } as const;

      for (const [name, userId] of Object.entries(actors) as [keyof typeof actors, string | null][]) {
        const expected = readCodes[name];
        if (expected === "ok") {
          await expect(readTree(userId, tree.id)).resolves.toMatchObject({ id: tree.id });
          await expect(createPerson(userId, tree.id, { firstName: name })).resolves.toMatchObject({ firstName: name });
        } else {
          await expect(readTree(userId, tree.id)).rejects.toMatchObject({ code: expected });
          await expect(createPerson(userId, tree.id, { firstName: name })).rejects.toMatchObject({ code: expected });
          await expect(deleteTree(userId, tree.id, tree.name)).rejects.toMatchObject({ code: expected });
          await expect(changeTreeVisibility(userId, tree.id, "unlisted", null)).rejects.toMatchObject({ code: expected });
        }
      }

      await expect(changeTreeVisibility(admin, tree.id, "public", "ramanathan")).rejects.toMatchObject({ code: "forbidden" });
      await expect(changeTreeVisibility(owner, tree.id, "public", "ramanathan")).resolves.toMatchObject({
        visibility: "public",
        publicTag: "ramanathan",
      });
      await expect(inviteTreeAdmin(admin, tree.id, "new@example.com")).rejects.toMatchObject({ code: "forbidden" });
      await expect(inviteTreeAdmin(owner, tree.id, "new@example.com")).resolves.toBeUndefined();

      for (const userId of [owner, admin, pending, stranger]) {
        await expect(
          createSuggestion(userId, tree.id, { type: "new_person", payload: { firstName: "Suggested" } }),
        ).resolves.toMatchObject({ status: "pending" });
      }
      await expect(createSuggestion(null, tree.id, { type: "new_person" })).rejects.toMatchObject({
        code: "unauthenticated",
      });

      await db.update(trees).set({ allowSuggestions: false }).where(eq(trees.id, tree.id));
      for (const userId of [owner, admin, pending, stranger]) {
        await expect(createSuggestion(userId, tree.id, { type: "new_person" })).rejects.toMatchObject({
          code: "forbidden",
        });
      }

      const [someone] = await db.select().from(persons).where(eq(persons.treeId, tree.id)).limit(1);
      if (!someone) throw new Error("expected a person");
      const extra = await createPerson(owner, tree.id, { firstName: "Extra" });
      await setViewerIdentity(stranger, tree.id, someone.id);
      await setViewerIdentity(owner, tree.id, extra.id);
      await expect(readViewerIdentity(stranger, tree.id)).resolves.toMatchObject({ personId: someone.id });
      await expect(readViewerIdentity(owner, tree.id)).resolves.toMatchObject({ personId: extra.id });

      const disposable = await createTree(owner, "owner@example.com", { name: "Disposable" });
      await expect(deleteTree(admin, disposable.id, "Disposable")).rejects.toMatchObject({ code: "forbidden" });
      await deleteTree(owner, disposable.id, "Disposable");
      await expect(readTree(owner, disposable.id)).rejects.toMatchObject({ code: "forbidden" });
    });
  });
});
