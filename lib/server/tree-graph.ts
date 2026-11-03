import "server-only";

import { sql } from "drizzle-orm";

import type { CustomFieldValues } from "@/lib/domain";
import type { DatePrecision, GraphParentLink, GraphPerson, GraphUnion, ParentKind, Sex, TreeGraph, UnionStatus } from "@/lib/family-graph";

import { requireTreeAdmin } from "./authz";
import { getDb } from "./db";

/** Authz-checked load of persons, parent links, and unions in a single query. */
export async function getTreeGraph(treeId: string, userId: string | null): Promise<TreeGraph> {
  await requireTreeAdmin(userId, treeId);
  const result = await getDb().execute(sql`
    select
      coalesce((
        select json_agg(json_build_object(
          'id', p.id,
          'treeId', p.tree_id,
          'firstName', p.first_name,
          'middleName', p.middle_name,
          'lastName', p.last_name,
          'preferredName', p.preferred_name,
          'birthSurname', p.birth_surname,
          'sex', p.sex,
          'birthDate', p.birth_date,
          'birthDatePrecision', p.birth_date_precision,
          'deathDate', p.death_date,
          'deathDatePrecision', p.death_date_precision,
          'isDeceased', p.is_deceased,
          'birthPlace', p.birth_place,
          'nativePlace', p.native_place,
          'currentLocation', p.current_location,
          'occupation', p.occupation,
          'bio', p.bio,
          'hasPhoto', p.has_photo,
          'phoneWhatsapp', p.phone_whatsapp,
          'email', p.email,
          'instagram', p.instagram,
          'facebook', p.facebook,
          'customFields', p.custom_fields,
          'isPlaceholder', p.is_placeholder
        ))
        from persons p
        where p.tree_id = ${treeId}
      ), '[]'::json) as persons,
      coalesce((
        select json_agg(json_build_object(
          'id', l.id,
          'parentId', l.parent_id,
          'childId', l.child_id,
          'kind', l.kind,
          'unionId', l.union_id
        ))
        from parent_links l
        where l.tree_id = ${treeId}
      ), '[]'::json) as parent_links,
      coalesce((
        select json_agg(json_build_object(
          'id', u.id,
          'personAId', u.person_a_id,
          'personBId', u.person_b_id,
          'status', u.status,
          'startDate', u.start_date,
          'endDate', u.end_date,
          'sortOrder', u.sort_order
        ))
        from unions u
        where u.tree_id = ${treeId}
      ), '[]'::json) as unions
  `);

  const row = firstRow(result);
  return {
    persons: asArray<GraphPerson>(row?.persons).map(normalizePerson),
    parentLinks: asArray<GraphParentLink>(row?.parent_links),
    unions: asArray<GraphUnion>(row?.unions),
  };
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows[0] as Record<string, unknown> | undefined;
  }
  return undefined;
}

function asArray<T>(value: unknown): T[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function normalizePerson(person: GraphPerson): GraphPerson {
  return {
    ...person,
    sex: person.sex as Sex,
    birthDate: asDate(person.birthDate),
    deathDate: asDate(person.deathDate),
    birthDatePrecision: person.birthDatePrecision as DatePrecision | null,
    deathDatePrecision: person.deathDatePrecision as DatePrecision | null,
    customFields: (person.customFields ?? {}) as CustomFieldValues,
    isPlaceholder: Boolean(person.isPlaceholder),
    middleName: person.middleName,
    lastName: person.lastName,
    preferredName: person.preferredName,
    birthSurname: person.birthSurname,
    birthPlace: person.birthPlace,
    nativePlace: person.nativePlace,
    currentLocation: person.currentLocation,
    occupation: person.occupation,
    bio: person.bio,
    phoneWhatsapp: person.phoneWhatsapp,
    email: person.email,
    instagram: person.instagram,
    facebook: person.facebook,
  };
}

function asDate(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export type { ParentKind, UnionStatus };
