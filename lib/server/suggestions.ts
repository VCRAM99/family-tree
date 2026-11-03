import "server-only";

import { and, eq } from "drizzle-orm";

import { persons, suggestions, trees } from "@/lib/db/schema";
import { createSuggestionSchema } from "@/lib/validation";

import { getDb } from "./db";
import { AuthzError } from "./errors";

export async function createSuggestion(
  userId: string | null,
  treeId: string,
  input: {
    type: "new_person" | "contact_update" | "correction";
    targetPersonId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  if (!userId) throw new AuthzError("Sign in to suggest a change.", "unauthenticated");
  const parsed = createSuggestionSchema.parse(input);
  const [tree] = await getDb()
    .select({ id: trees.id, allowSuggestions: trees.allowSuggestions })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);
  if (!tree) throw new AuthzError("Tree not found.", "not_found");
  if (!tree.allowSuggestions) {
    throw new AuthzError("This tree is not accepting suggestions.", "forbidden");
  }

  if (parsed.targetPersonId) {
    const [person] = await getDb()
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.id, parsed.targetPersonId), eq(persons.treeId, treeId)))
      .limit(1);
    if (!person) throw new AuthzError("That person is not in this tree.", "invalid");
  }

  const [suggestion] = await getDb()
    .insert(suggestions)
    .values({
      treeId,
      submittedBy: userId,
      type: parsed.type,
      targetPersonId: parsed.targetPersonId ?? null,
      payload: parsed.payload ?? {},
    })
    .returning();
  if (!suggestion) throw new AuthzError("Could not save the suggestion.", "invalid");
  return suggestion;
}
