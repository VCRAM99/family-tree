import "server-only";

import { and, eq } from "drizzle-orm";

import { persons, viewerIdentities } from "@/lib/db/schema";

import { getDb } from "./db";
import { AuthzError } from "./errors";

/** A viewer identity is private to the signed-in user. Callers cannot address another user's row. */
export async function setViewerIdentity(userId: string | null, treeId: string, personId: string) {
  if (!userId) throw new AuthzError("Sign in to mark yourself on a tree.", "unauthenticated");
  const [person] = await getDb()
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.treeId, treeId)))
    .limit(1);
  if (!person) throw new AuthzError("That person is not in this tree.", "invalid");

  await getDb()
    .insert(viewerIdentities)
    .values({ userId, treeId, personId })
    .onConflictDoUpdate({
      target: [viewerIdentities.userId, viewerIdentities.treeId],
      set: { personId, updatedAt: new Date() },
    });
}

export async function readViewerIdentity(userId: string | null, treeId: string) {
  if (!userId) throw new AuthzError("Sign in to continue.", "unauthenticated");
  const [row] = await getDb()
    .select({ personId: viewerIdentities.personId })
    .from(viewerIdentities)
    .where(and(eq(viewerIdentities.userId, userId), eq(viewerIdentities.treeId, treeId)))
    .limit(1);
  return row ?? null;
}
