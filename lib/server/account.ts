import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { account, session, suggestions, treeAdmins, trees, user, verification } from "@/lib/db/schema";

import { auth } from "./auth";
import { getDb } from "./db";
import { AuthzError } from "./errors";
import { requireUser } from "./session";

export async function changeDisplayName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) throw new AuthzError("Use a name under 80 characters.", "invalid");
  try {
    await auth.api.updateUser({
      body: { name: trimmed },
      headers: await headers(),
    });
  } catch (error) {
    throw new AuthzError(error instanceof Error ? error.message : "Could not save that name.", "invalid");
  }
}

export async function changePassword(currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new AuthzError("Use at least 8 characters.", "invalid");
  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    throw new AuthzError(error instanceof Error ? error.message : "Could not change the password.", "invalid");
  }
}

/** Deletes owned trees and their data, then the account, in one transaction. */
export async function deleteAccount(confirmation: string) {
  const current = await requireUser();
  await deleteAccountData(current, confirmation);
}

export async function deleteAccountData(current: { id: string; email: string }, confirmation: string) {
  if (confirmation.trim().toLowerCase() !== current.email.toLowerCase()) {
    throw new AuthzError("Type your email address to confirm.", "invalid");
  }
  await getDb().transaction(async (tx) => {
    await tx.delete(trees).where(eq(trees.ownerId, current.id));
    await tx.delete(suggestions).where(eq(suggestions.submittedBy, current.id));
    await tx.update(suggestions).set({ reviewedBy: null }).where(eq(suggestions.reviewedBy, current.id));
    await tx.delete(treeAdmins).where(eq(treeAdmins.userId, current.id));
    await tx.delete(session).where(eq(session.userId, current.id));
    await tx.delete(account).where(eq(account.userId, current.id));
    await tx.delete(verification).where(eq(verification.identifier, current.email));
    await tx.delete(user).where(eq(user.id, current.id));
  });
}
