import "server-only";

import { and, eq, ilike, or, sql } from "drizzle-orm";

import type { CustomFieldDef, PersonField, ThemeId } from "@/lib/domain";
import { lookupBuckets, parentLinks, persons, trees, unions } from "@/lib/db/schema";
import type { DatePrecision, GraphParentLink, GraphPerson, GraphUnion, Sex, TreeGraph, UnionStatus } from "@/lib/family-graph";
import { preferredDisplayName } from "@/lib/family-graph";
import { isThemeId } from "@/lib/themes";
import { parseCustomFieldDefs } from "@/lib/validation";

import { getDb } from "./db";

const LOOKUP_LIMIT = 30;

export const PUBLIC_PERSON_KEYS = [
  "id",
  "treeId",
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "birthSurname",
  "sex",
  "birthDate",
  "birthDatePrecision",
  "deathDate",
  "deathDatePrecision",
  "isDeceased",
  "birthPlace",
  "nativePlace",
  "currentLocation",
  "occupation",
  "bio",
  "hasPhoto",
  "phoneWhatsapp",
  "email",
  "instagram",
  "facebook",
  "customFields",
  "livingOnly",
] as const;

/**
 * Sanitized reads for the public and unlisted viewers.
 * Prompt 4 fills these in. The shapes are stable so the viewer can land without a schema change.
 */
export type PublicTreeSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: "unlisted" | "public";
  publicTag: string | null;
  allowSuggestions: boolean;
  socialsEnabled: boolean;
  photosEnabled: boolean;
  hideLivingDetails: boolean;
  visibleFields: string[];
  theme: ThemeId;
  customFieldDefs: CustomFieldDef[];
};

export type PublicPerson = {
  id: string;
  displayName: string;
  fields: Record<string, string | null>;
};

export type PublicTreeView = {
  summary: PublicTreeSummary;
  graph: TreeGraph;
};

type Policy = {
  hideLivingDetails: boolean;
  socialsEnabled: boolean;
  photosEnabled: boolean;
  visibleFields: readonly string[];
};

type PersonSource = {
  id: string;
  treeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  preferredName: string | null;
  birthSurname: string | null;
  sex: Sex;
  birthDate: string | null;
  birthDatePrecision: DatePrecision | null;
  deathDate: string | null;
  deathDatePrecision: DatePrecision | null;
  isDeceased: boolean;
  birthPlace: string | null;
  nativePlace: string | null;
  currentLocation: string | null;
  occupation: string | null;
  bio: string | null;
  hasPhoto: boolean;
  phoneWhatsapp: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  customFields: GraphPerson["customFields"];
  isPlaceholder?: boolean;
};

/** One lookup per IP per minute. Over the limit looks the same as a miss. */
export async function consumeLookup(ip: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const id = `${ip}:${windowStart.toISOString()}`;
  const [row] = await getDb()
    .insert(lookupBuckets)
    .values({ id, count: 1, windowStart })
    .onConflictDoUpdate({
      target: lookupBuckets.id,
      set: { count: sql`${lookupBuckets.count} + 1` },
    })
    .returning({ count: lookupBuckets.count });
  if ((row?.count ?? 1) === 1) {
    await getDb().delete(lookupBuckets).where(sql`${lookupBuckets.windowStart} < ${windowStart}`);
  }
  return (row?.count ?? 1) <= LOOKUP_LIMIT;
}

export function sanitizePublicPerson(person: PersonSource, policy: Policy): GraphPerson {
  const living = !person.isDeceased && !person.deathDate;
  const hidden = policy.hideLivingDetails && living;
  const show = (field: PersonField) => !hidden && policy.visibleFields.includes(field);
  const view: GraphPerson = {
    id: person.id,
    treeId: person.treeId,
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    preferredName: person.preferredName,
    birthSurname: show("birth_surname") ? person.birthSurname : null,
    sex: show("sex") ? person.sex : "unknown",
    birthDate: show("birth_date") ? person.birthDate : null,
    birthDatePrecision: show("birth_date") ? person.birthDatePrecision : null,
    deathDate: show("death_date") ? person.deathDate : null,
    deathDatePrecision: show("death_date") ? person.deathDatePrecision : null,
    isDeceased: hidden ? false : person.isDeceased,
    birthPlace: show("birth_place") ? person.birthPlace : null,
    nativePlace: show("native_place") ? person.nativePlace : null,
    currentLocation: show("current_location") ? person.currentLocation : null,
    occupation: show("occupation") ? person.occupation : null,
    bio: show("bio") ? person.bio : null,
    hasPhoto: !hidden && policy.photosEnabled && person.hasPhoto,
    phoneWhatsapp: !hidden && policy.socialsEnabled ? person.phoneWhatsapp : null,
    email: !hidden && policy.socialsEnabled ? person.email : null,
    instagram: !hidden && policy.socialsEnabled ? person.instagram : null,
    facebook: !hidden && policy.socialsEnabled ? person.facebook : null,
    customFields: hidden ? {} : { ...person.customFields },
    livingOnly: hidden,
  };
  return view;
}

export function wouldShowPhoto(person: Pick<PersonSource, "isDeceased" | "deathDate" | "hasPhoto">, policy: Pick<Policy, "hideLivingDetails" | "photosEnabled">): boolean {
  const living = !person.isDeceased && !person.deathDate;
  if (policy.hideLivingDetails && living) return false;
  return policy.photosEnabled && person.hasPhoto;
}

export async function getPublicTreeByTag(tag: string, ip = "local"): Promise<PublicTreeView | null> {
  if (!(await consumeLookup(ip))) return null;
  return readByTag(tag);
}

export async function getTreeByCode(code: string, ip = "local"): Promise<PublicTreeView | null> {
  if (!(await consumeLookup(ip))) return null;
  return readByCode(code);
}

export async function getPublicTreeByShareCode(code: string): Promise<PublicTreeSummary | null> {
  const view = await getTreeByCode(code);
  return view?.summary ?? null;
}

export async function listPublicPersons(treeId: string): Promise<PublicPerson[]> {
  const view = await readTreeView(treeId, ["public", "unlisted"]);
  if (!view) return [];
  return view.graph.persons.map((person) => ({
    id: person.id,
    displayName: preferredDisplayName(person),
    fields: personFields(person),
  }));
}

export async function searchPublicTrees(query: string, ip = "local"): Promise<{ name: string; publicTag: string }[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  if (!(await consumeLookup(ip))) return [];
  const pattern = `%${needle.replace(/[%_]/g, "")}%`;
  const rows = await getDb()
    .select({ name: trees.name, publicTag: trees.publicTag })
    .from(trees)
    .where(and(eq(trees.visibility, "public"), or(ilike(trees.name, pattern), ilike(trees.publicTag, pattern))))
    .limit(8);
  return rows.flatMap((row) => (row.publicTag ? [{ name: row.name, publicTag: row.publicTag }] : []));
}

export async function publicPhotoAllowed(personId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({
      hasPhoto: persons.hasPhoto,
      isDeceased: persons.isDeceased,
      deathDate: persons.deathDate,
      isPlaceholder: persons.isPlaceholder,
      visibility: trees.visibility,
      photosEnabled: trees.photosEnabled,
      hideLivingDetails: trees.hideLivingDetails,
    })
    .from(persons)
    .innerJoin(trees, eq(trees.id, persons.treeId))
    .where(eq(persons.id, personId))
    .limit(1);
  if (!row || row.isPlaceholder) return false;
  if (row.visibility !== "public" && row.visibility !== "unlisted") return false;
  return wouldShowPhoto(row, row);
}

async function readByTag(tag: string): Promise<PublicTreeView | null> {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return null;
  const [tree] = await getDb()
    .select({ id: trees.id })
    .from(trees)
    .where(and(eq(trees.visibility, "public"), sql`lower(${trees.publicTag}) = ${normalized}`))
    .limit(1);
  if (!tree) return null;
  return readTreeView(tree.id, ["public"]);
}

async function readByCode(code: string): Promise<PublicTreeView | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(normalized)) return null;
  const [tree] = await getDb()
    .select({ id: trees.id, visibility: trees.visibility })
    .from(trees)
    .where(eq(trees.shareCode, normalized))
    .limit(1);
  if (!tree || tree.visibility === "private") return null;
  return readTreeView(tree.id, ["public", "unlisted"]);
}

async function readTreeView(treeId: string, allowed: Array<"public" | "unlisted">): Promise<PublicTreeView | null> {
  const [tree] = await getDb().select().from(trees).where(eq(trees.id, treeId)).limit(1);
  if (!tree || tree.visibility === "private" || !allowed.includes(tree.visibility as "public" | "unlisted")) return null;
  const [people, links, pairings] = await Promise.all([
    getDb().select().from(persons).where(eq(persons.treeId, treeId)),
    getDb().select().from(parentLinks).where(eq(parentLinks.treeId, treeId)),
    getDb().select().from(unions).where(eq(unions.treeId, treeId)),
  ]);
  const policy: Policy = {
    hideLivingDetails: tree.hideLivingDetails,
    socialsEnabled: tree.socialsEnabled,
    photosEnabled: tree.photosEnabled,
    visibleFields: tree.visibleFields,
  };
  const visible = people.filter((person) => !person.isPlaceholder);
  const hidden = new Set(people.filter((person) => person.isPlaceholder).map((person) => person.id));
  const graph: TreeGraph = {
    persons: visible.map((person) =>
      sanitizePublicPerson(
        {
          ...person,
          birthDate: person.birthDate,
          deathDate: person.deathDate,
          customFields: person.customFields ?? {},
        },
        policy,
      ),
    ),
    parentLinks: links
      .filter((link) => !hidden.has(link.parentId) && !hidden.has(link.childId))
      .map(
        (link): GraphParentLink => ({
          id: link.id,
          parentId: link.parentId,
          childId: link.childId,
          kind: link.kind,
          unionId: link.unionId,
        }),
      ),
    unions: pairings
      .filter((union) => !hidden.has(union.personAId) && !hidden.has(union.personBId))
      .map(
        (union): GraphUnion => ({
          id: union.id,
          personAId: union.personAId,
          personBId: union.personBId,
          status: union.status as UnionStatus,
          startDate: union.startDate,
          endDate: union.endDate,
          sortOrder: union.sortOrder,
        }),
      ),
  };
  const summary: PublicTreeSummary = {
    id: tree.id,
    name: tree.name,
    description: tree.description,
    visibility: tree.visibility as "public" | "unlisted",
    publicTag: tree.publicTag,
    allowSuggestions: tree.allowSuggestions,
    socialsEnabled: tree.socialsEnabled,
    photosEnabled: tree.photosEnabled,
    hideLivingDetails: tree.hideLivingDetails,
    visibleFields: tree.visibleFields,
    theme: isThemeId(tree.theme) ? tree.theme : "system",
    customFieldDefs: parseCustomFieldDefs(tree.customFieldDefs),
  };
  return { summary, graph };
}

function personFields(person: GraphPerson): Record<string, string | null> {
  return {
    birthDate: person.birthDate,
    deathDate: person.deathDate,
    birthPlace: person.birthPlace,
    nativePlace: person.nativePlace,
    currentLocation: person.currentLocation,
    occupation: person.occupation,
    bio: person.bio,
    phoneWhatsapp: person.phoneWhatsapp,
    email: person.email,
    instagram: person.instagram,
    facebook: person.facebook,
    living: person.livingOnly ? "Living" : null,
  };
}
