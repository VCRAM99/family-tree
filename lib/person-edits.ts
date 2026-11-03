import type { GraphPerson, ParentKind, Sex, UnionStatus } from "@/lib/family-graph";

export type PersonPatch = {
  firstName?: string;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  birthSurname?: string | null;
  sex?: Sex;
  birthDate?: string | null;
  birthDatePrecision?: "exact" | "month" | "year" | "approx" | null;
  deathDate?: string | null;
  deathDatePrecision?: "exact" | "month" | "year" | "approx" | null;
  isDeceased?: boolean;
  birthPlace?: string | null;
  nativePlace?: string | null;
  currentLocation?: string | null;
  occupation?: string | null;
  bio?: string | null;
  phoneWhatsapp?: string | null;
  email?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  customFields?: Record<string, string | number | null>;
};

export type NewPersonInput = {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  sex?: Sex;
};

export type RelationInput =
  | { kind: "root" }
  | { kind: "father" | "mother"; childId: string; alsoSiblings?: boolean; replacePlaceholder?: boolean }
  | { kind: "spouse"; personId: string }
  | { kind: "child"; parentId: string; unionId: string | null }
  | { kind: "sibling"; personId: string };

export type LinkInput =
  | { kind: "father" | "mother"; parentId: string; childId: string; alsoSiblings?: boolean; replacePlaceholder?: boolean }
  | { kind: "spouse"; personId: string; otherId: string }
  | { kind: "child"; parentId: string; childId: string; unionId: string | null }
  | { kind: "sibling"; personId: string; otherId: string };

const IDENTITY_KEYS = new Set<keyof PersonPatch>(["firstName", "middleName", "lastName", "sex"]);

/**
 * Fields typed on a draft before it has a database row.
 * Explicit nulls stay in the patch so a cleared date is not dropped on create.
 */
export function carriedDraftPatch(person: GraphPerson, touched: PersonPatch): PersonPatch {
  const patch: PersonPatch = {};
  for (const key of Object.keys(touched) as (keyof PersonPatch)[]) {
    if (IDENTITY_KEYS.has(key)) continue;
    if (key === "customFields") {
      patch.customFields = { ...person.customFields };
      continue;
    }
    const value = person[key as keyof GraphPerson];
    (patch as Record<string, unknown>)[key] = value ?? null;
  }
  return patch;
}

/** Copy only the fields this save wrote. In-progress edits on other fields stay put. */
export function mergeSavedPerson(current: GraphPerson, saved: GraphPerson, patch: PersonPatch): GraphPerson {
  const next: GraphPerson = { ...current, id: saved.id, pending: false, clientKey: current.clientKey ?? current.id };
  if (current.id !== saved.id) next.aliases = [...new Set([...(current.aliases ?? []), current.id])];
  for (const key of Object.keys(patch) as (keyof PersonPatch)[]) {
    if (key === "customFields") next.customFields = { ...current.customFields, ...(saved.customFields ?? {}) };
    else {
      const savedKey = key as keyof GraphPerson;
      if (savedKey in saved) (next[savedKey] as GraphPerson[typeof savedKey]) = saved[savedKey];
    }
  }
  return next;
}

/** One spouse is the other parent. Several spouses need a choice. None stays unknown. */
export function childUnionChoice(unionIds: readonly string[]): { step: "choose" | "union"; unionId: string | null } {
  if (unionIds.length === 1) return { step: "choose", unionId: unionIds[0] ?? null };
  if (unionIds.length > 1) return { step: "union", unionId: null };
  return { step: "choose", unionId: null };
}

export type { ParentKind, UnionStatus };
