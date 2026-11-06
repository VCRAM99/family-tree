import { notFound } from "next/navigation";

import { SuggestionInbox } from "@/components/suggestion-inbox";
import { getTreeRole } from "@/lib/server/authz";
import { persons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { personGraphColumns } from "@/lib/server/person-columns";
import { requireUser } from "@/lib/server/session";
import { listSuggestions } from "@/lib/server/suggestions";

export default async function SuggestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const role = await getTreeRole(user.id, id);
  if (!role) notFound();
  const [rows, people] = await Promise.all([
    listSuggestions(user.id, id),
    getDb().select(personGraphColumns).from(persons).where(eq(persons.treeId, id)),
  ]);
  const byId = new Map(people.map((person) => [person.id, person]));
  return (
    <div className="h-full overflow-auto">
    <SuggestionInbox
      treeId={id}
      suggestions={rows.map((row) => {
        const person = row.targetPersonId ? byId.get(row.targetPersonId) : undefined;
        const name = person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "New person";
        return {
          id: row.id,
          type: row.type,
          status: row.status,
          payload: row.payload ?? {},
          targetName: name,
          createdAt: row.createdAt.toISOString(),
          submitterName: row.submitterName,
          submitterEmail: row.submitterEmail,
          diff: suggestionDiff(row.payload ?? {}, person),
        };
      })}
    />
    </div>
  );
}

function suggestionDiff(
  payload: Record<string, unknown>,
  person: object | undefined,
): { field: string; current: string; proposed: string }[] {
  const currentRecord = person as Record<string, unknown> | undefined;
  const source =
    payload.patch && typeof payload.patch === "object" ? (payload.patch as Record<string, unknown>) : payload;
  return Object.entries(source).flatMap(([field, value]) => {
    if (value == null || value === "" || typeof value === "object") return [];
    const currentValue = currentRecord && field in currentRecord ? currentRecord[field] : null;
    const current = currentValue == null || currentValue === "" ? "—" : String(currentValue);
    return [{ field, current, proposed: String(value) }];
  });
}
