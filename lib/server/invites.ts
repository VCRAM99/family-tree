import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { user } from "@/lib/db/auth-schema";
import { treeAdmins, trees } from "@/lib/db/schema";

import { requireTreeOwner } from "./authz";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { AuthzError, isUniqueViolation } from "./errors";

export async function inviteTreeAdmin(actorId: string | null, treeId: string, email: string) {
  await requireTreeOwner(actorId, treeId);
  const invitedEmail = email.trim().toLowerCase();
  if (!invitedEmail.includes("@")) throw new AuthzError("Enter an email address.", "invalid");

  const [existingUser] = await getDb().select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${invitedEmail}`).limit(1);
  const [tree] = await getDb().select({ name: trees.name }).from(trees).where(eq(trees.id, treeId)).limit(1);
  if (!tree) throw new AuthzError("Tree not found.", "not_found");

  try {
    await getDb().insert(treeAdmins).values({
      treeId,
      userId: existingUser?.id ?? null,
      invitedEmail,
      role: "admin",
      status: "pending",
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AuthzError("That person is already invited.", "invalid");
    throw error;
  }

  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const link = existingUser ? `${origin}/dashboard` : `${origin}/?mode=sign-up&next=/dashboard`;
  void sendEmail({
    to: invitedEmail,
    subject: `You're invited to ${tree.name}`,
    text: existingUser
      ? `You have been invited to help tend ${tree.name}.\nAccept or decline: ${link}\n`
      : `You have been invited to help tend ${tree.name}.\nCreate an account with this email address, then accept the invitation: ${link}\n`,
  }).catch((error: unknown) => {
    console.error("[email] invite failed", error);
  });
}

export async function listTreeAdmins(actorId: string | null, treeId: string) {
  await requireTreeOwner(actorId, treeId);
  const rows = await getDb()
    .select({
      id: treeAdmins.id,
      email: treeAdmins.invitedEmail,
      role: treeAdmins.role,
      status: treeAdmins.status,
      name: user.name,
    })
    .from(treeAdmins)
    .leftJoin(user, eq(user.id, treeAdmins.userId))
    .where(eq(treeAdmins.treeId, treeId));
  return rows.sort((a, b) => a.email.localeCompare(b.email));
}

export async function revokeInvite(actorId: string | null, treeId: string, adminId: string) {
  await requireTreeOwner(actorId, treeId);
  const [row] = await getDb()
    .delete(treeAdmins)
    .where(and(eq(treeAdmins.id, adminId), eq(treeAdmins.treeId, treeId), eq(treeAdmins.status, "pending")))
    .returning({ id: treeAdmins.id });
  if (!row) throw new AuthzError("That invitation is not pending.", "not_found");
}

export async function removeAdmin(actorId: string | null, treeId: string, adminId: string) {
  await requireTreeOwner(actorId, treeId);
  const [row] = await getDb()
    .select({ role: treeAdmins.role })
    .from(treeAdmins)
    .where(and(eq(treeAdmins.id, adminId), eq(treeAdmins.treeId, treeId)))
    .limit(1);
  if (!row) throw new AuthzError("That admin is not on this tree.", "not_found");
  if (row.role === "owner") throw new AuthzError("The owner cannot be removed.", "forbidden");
  await getDb().delete(treeAdmins).where(and(eq(treeAdmins.id, adminId), eq(treeAdmins.treeId, treeId)));
}

export async function listMyInvites(userId: string) {
  const rows = await getDb()
    .select({
      id: treeAdmins.id,
      treeId: treeAdmins.treeId,
      treeName: trees.name,
    })
    .from(treeAdmins)
    .innerJoin(trees, eq(trees.id, treeAdmins.treeId))
    .where(and(eq(treeAdmins.userId, userId), eq(treeAdmins.status, "pending")));
  return rows.sort((a, b) => a.treeName.localeCompare(b.treeName));
}

export async function respondToInvite(userId: string, adminId: string, accept: boolean) {
  const [row] = await getDb()
    .select({ id: treeAdmins.id })
    .from(treeAdmins)
    .where(and(eq(treeAdmins.id, adminId), eq(treeAdmins.userId, userId), eq(treeAdmins.status, "pending")))
    .limit(1);
  if (!row) throw new AuthzError("That invitation is not yours.", "not_found");
  if (!accept) {
    await getDb().delete(treeAdmins).where(eq(treeAdmins.id, adminId));
    return;
  }
  await getDb()
    .update(treeAdmins)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(treeAdmins.id, adminId));
}

/** Link pending email invites once the account exists and the address is verified. */
export async function claimPendingInvites(userId: string) {
  const [account] = await getDb().select({ email: user.email, emailVerified: user.emailVerified }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account?.emailVerified) return;
  const email = account.email.trim().toLowerCase();
  await getDb()
    .update(treeAdmins)
    .set({ userId, updatedAt: new Date() })
    .where(and(sql`lower(${treeAdmins.invitedEmail}) = ${email}`, sql`${treeAdmins.userId} is null`));
}
