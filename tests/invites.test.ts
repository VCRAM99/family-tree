import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { treeAdmins } from "@/lib/db/schema";
import { claimPendingInvites, inviteTreeAdmin, revokeInvite } from "@/lib/server/invites";
import { createTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

describe("admin invites", () => {
  it.each([
    { actor: "owner", allow: true },
    { actor: "admin", allow: false },
  ] as const)("$actor managing invites is allowed=$allow", async ({ actor, allow }) => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const admin = crypto.randomUUID();
      await db.insert(user).values([
        { id: owner, name: "Owner", email: `inv-owner-${actor}@example.com`, emailVerified: true },
        { id: admin, name: "Admin", email: `inv-admin-${actor}@example.com`, emailVerified: true },
      ]);
      const tree = await createTree(owner, `inv-owner-${actor}@example.com`, { name: "Invites" });
      await db.insert(treeAdmins).values({
        treeId: tree.id,
        userId: admin,
        invitedEmail: `inv-admin-${actor}@example.com`,
        role: "admin",
        status: "accepted",
      });
      const userId = actor === "owner" ? owner : admin;
      const call = inviteTreeAdmin(userId, tree.id, `new-${actor}@example.com`);
      if (allow) await expect(call).resolves.toBeUndefined();
      else await expect(call).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  it("attaches a pending invite when the invited email verifies", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const joiner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "claim-owner@example.com", emailVerified: true });
      const tree = await createTree(owner, "claim-owner@example.com", { name: "Claim" });
      await inviteTreeAdmin(owner, tree.id, "joiner@example.com");
      await db.insert(user).values({ id: joiner, name: "Joiner", email: "joiner@example.com", emailVerified: false });
      await claimPendingInvites(joiner);
      const [before] = await db.select().from(treeAdmins).where(eq(treeAdmins.invitedEmail, "joiner@example.com"));
      expect(before?.userId).toBeNull();
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, joiner));
      await claimPendingInvites(joiner);
      const [after] = await db.select().from(treeAdmins).where(eq(treeAdmins.invitedEmail, "joiner@example.com"));
      expect(after?.userId).toBe(joiner);
      expect(after?.status).toBe("pending");
    });
  });

  it("lets the owner revoke a pending invite", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "revoke-owner@example.com", emailVerified: true });
      const tree = await createTree(owner, "revoke-owner@example.com", { name: "Revoke" });
      await inviteTreeAdmin(owner, tree.id, "gone@example.com");
      const [row] = await db.select().from(treeAdmins).where(eq(treeAdmins.invitedEmail, "gone@example.com"));
      await revokeInvite(owner, tree.id, row!.id);
      const left = await db.select().from(treeAdmins).where(eq(treeAdmins.invitedEmail, "gone@example.com"));
      expect(left).toEqual([]);
    });
  });
});
