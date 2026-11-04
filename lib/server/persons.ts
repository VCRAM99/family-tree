import "server-only";

import { and, eq } from "drizzle-orm";

import { persons } from "@/lib/db/schema";
import { personGraphColumns } from "./person-columns";
import { createPersonSchema, emptyToNull } from "@/lib/validation";

import { requireTreeAdmin } from "./authz";
import { getDb } from "./db";
import { AuthzError } from "./errors";

export async function createPerson(
  userId: string | null,
  treeId: string,
  input: { firstName: string; middleName?: string; lastName?: string; sex?: "male" | "female" | "other" | "unknown" },
) {
  await requireTreeAdmin(userId, treeId);
  const parsed = createPersonSchema.parse(input);
  const [person] = await getDb()
    .insert(persons)
    .values({
      treeId,
      firstName: parsed.firstName,
      middleName: emptyToNull(parsed.middleName),
      lastName: emptyToNull(parsed.lastName),
      sex: parsed.sex ?? "unknown",
      createdBy: userId,
    })
    .returning();
  if (!person) throw new AuthzError("Could not add that person.", "invalid");
  return person;
}

export async function getPersonInTree(treeId: string, personId: string) {
  const [person] = await getDb()
    .select(personGraphColumns)
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.treeId, treeId)))
    .limit(1);
  return person ?? null;
}
