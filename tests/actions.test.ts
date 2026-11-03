import { beforeEach, describe, expect, it, vi } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { treeAdmins } from "@/lib/db/schema";
import { createTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

const requireUser = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
}));

vi.mock("@/lib/server/session", () => ({
  requireUser: () => requireUser(),
}));

import { createPersonAction, deletePersonAction, linkPeopleAction, updatePersonAction } from "@/app/tree/[id]/actions";

async function makeUser(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0], email: string) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: email, email });
  return id;
}

describe("tree server actions", () => {
  beforeEach(() => {
    requireUser.mockReset();
  });

  it("rejects signed-out and non-admin create, edit, delete, and link", async () => {
    await withTestDatabase(async (db) => {
      const owner = await makeUser(db, "owner@example.com");
      const stranger = await makeUser(db, "stranger@example.com");
      const tree = await createTree(owner, "owner@example.com", { name: "Kin" });
      await db.insert(treeAdmins).values({
        treeId: tree.id,
        userId: stranger,
        invitedEmail: "stranger@example.com",
        role: "admin",
        status: "pending",
      });

      requireUser.mockResolvedValueOnce({ id: owner, name: "Owner", email: "owner@example.com" });
      const saved = await createPersonAction(tree.id, { firstName: "Ada" }, { kind: "root" });
      if (!("person" in saved) || !saved.person) throw new Error("owner create failed");

      requireUser.mockRejectedValue(new Error("redirect"));
      await expect(createPersonAction(tree.id, { firstName: "No" }, { kind: "root" })).rejects.toThrow(/redirect/);
      await expect(updatePersonAction(tree.id, saved.person.id, { firstName: "No" })).rejects.toThrow(/redirect/);
      await expect(deletePersonAction(tree.id, saved.person.id)).rejects.toThrow(/redirect/);
      await expect(
        linkPeopleAction(tree.id, { kind: "father", parentId: crypto.randomUUID(), childId: saved.person.id }),
      ).rejects.toThrow(/redirect/);

      requireUser.mockResolvedValue({ id: stranger, name: "Stranger", email: "stranger@example.com" });
      const denied = [
        await createPersonAction(tree.id, { firstName: "No" }, { kind: "root" }),
        await updatePersonAction(tree.id, saved.person.id, { firstName: "No" }),
        await deletePersonAction(tree.id, saved.person.id),
        await linkPeopleAction(tree.id, { kind: "father", parentId: crypto.randomUUID(), childId: saved.person.id }),
      ];
      for (const result of denied) {
        expect(result).toMatchObject({ error: expect.stringMatching(/access|admin|permission|not allowed|forbidden/i) });
      }
    });
  });
});