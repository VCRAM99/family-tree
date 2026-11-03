import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { parentLinks, persons, trees, unions } from "@/lib/db/schema";
import type { GraphParentLink, GraphPerson, GraphUnion, ParentKind, Sex, UnionStatus } from "@/lib/family-graph";
import type { LinkInput, NewPersonInput, PersonPatch, RelationInput } from "@/lib/person-edits";
import { createGraphIndex, parents, siblings, spouses, childrenGrouped } from "@/lib/family-graph";
import {
  contactError,
  customFieldsError,
  normalizeOptional,
  personDateError,
  unionDateError,
} from "@/lib/validation";

import { requireTreeAdmin } from "./authz";
import { getDb } from "./db";
import { AuthzError, isAncestryCycle, isUniqueViolation } from "./errors";
import { toGraphLink, toGraphPerson, toGraphUnion } from "./graph-map";

export type { LinkInput, NewPersonInput, PersonPatch, RelationInput } from "@/lib/person-edits";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type WriteResult = {
  person?: GraphPerson;
  persons?: GraphPerson[];
  removedPersonIds?: string[];
  parentLinks: GraphParentLink[];
  unions: GraphUnion[];
};

const textKeys = [
  "middleName",
  "lastName",
  "preferredName",
  "birthSurname",
  "birthPlace",
  "nativePlace",
  "currentLocation",
  "occupation",
  "bio",
  "phoneWhatsapp",
  "email",
  "instagram",
  "facebook",
] as const;

export async function updatePerson(userId: string | null, treeId: string, personId: string, patch: PersonPatch): Promise<GraphPerson> {
  await requireTreeAdmin(userId, treeId);
  const db = getDb();
  const [existing] = await db.select().from(persons).where(and(eq(persons.id, personId), eq(persons.treeId, treeId))).limit(1);
  if (!existing) throw new AuthzError("That person is not in this tree.", "invalid");

  const next = { ...toGraphPerson(existing) };
  if (patch.firstName !== undefined) {
    const firstName = patch.firstName.trim();
    if (!firstName) throw new AuthzError("A first name is required.", "invalid");
    if (firstName.length > 80) throw new AuthzError("Keep the first name under 80 characters.", "invalid");
    next.firstName = firstName;
  }
  for (const key of textKeys) {
    if (patch[key] !== undefined) next[key] = normalizeOptional(patch[key]);
  }
  if (patch.sex) next.sex = patch.sex;
  if (patch.isDeceased !== undefined) next.isDeceased = patch.isDeceased;
  if (patch.birthDate !== undefined || patch.birthDatePrecision !== undefined) {
    const birthDate = patch.birthDate !== undefined ? normalizeOptional(patch.birthDate) : next.birthDate;
    const precision = patch.birthDatePrecision !== undefined ? patch.birthDatePrecision : next.birthDatePrecision;
    next.birthDate = birthDate;
    next.birthDatePrecision = birthDate ? precision : null;
  }
  if (patch.deathDate !== undefined || patch.deathDatePrecision !== undefined) {
    const deathDate = patch.deathDate !== undefined ? normalizeOptional(patch.deathDate) : next.deathDate;
    const precision = patch.deathDatePrecision !== undefined ? patch.deathDatePrecision : next.deathDatePrecision;
    next.deathDate = deathDate;
    next.deathDatePrecision = deathDate ? precision : null;
  }
  if (patch.customFields) {
    next.customFields = { ...next.customFields, ...patch.customFields };
  }

  const [tree] = await db.select({ customFieldDefs: trees.customFieldDefs }).from(trees).where(eq(trees.id, treeId)).limit(1);
  const dateMessage = personDateError(next);
  const contactMessage = contactError(next);
  const customMessage = customFieldsError(tree?.customFieldDefs ?? [], next.customFields);
  const message = dateMessage ?? contactMessage ?? customMessage;
  if (message) throw new AuthzError(message, "invalid");

  const [saved] = await db
    .update(persons)
    .set({
      firstName: next.firstName,
      middleName: next.middleName,
      lastName: next.lastName,
      preferredName: next.preferredName,
      birthSurname: next.birthSurname,
      sex: next.sex,
      birthDate: next.birthDate,
      birthDatePrecision: next.birthDatePrecision,
      deathDate: next.deathDate,
      deathDatePrecision: next.deathDatePrecision,
      isDeceased: next.isDeceased,
      birthPlace: next.birthPlace,
      nativePlace: next.nativePlace,
      currentLocation: next.currentLocation,
      occupation: next.occupation,
      bio: next.bio,
      phoneWhatsapp: next.phoneWhatsapp,
      email: next.email,
      instagram: next.instagram,
      facebook: next.facebook,
      customFields: next.customFields,
      updatedAt: new Date(),
    })
    .where(and(eq(persons.id, personId), eq(persons.treeId, treeId)))
    .returning();
  if (!saved) throw new AuthzError("That person is not in this tree.", "invalid");
  return toGraphPerson(saved);
}

export async function createPersonWithRelation(
  userId: string | null,
  treeId: string,
  input: NewPersonInput,
  relation: RelationInput,
): Promise<WriteResult> {
  await requireTreeAdmin(userId, treeId);
  const firstName = input.firstName.trim();
  if (!firstName) throw new AuthzError("A first name is required.", "invalid");
  const sex: Sex = relation.kind === "father" ? "male" : relation.kind === "mother" ? "female" : (input.sex ?? "unknown");

  try {
    return await getDb().transaction(async (tx) => {
      const plan = relation;
      const [person] = await tx
        .insert(persons)
        .values({
          treeId,
          firstName,
          middleName: normalizeOptional(input.middleName),
          lastName: normalizeOptional(input.lastName),
          sex,
          createdBy: userId,
        })
        .returning();
      if (!person) throw new AuthzError("Could not add that person.", "invalid");

      switch (plan.kind) {
        case "root":
          return { person: toGraphPerson(person), parentLinks: [], unions: [] };
        case "father":
        case "mother": {
          await requirePerson(tx, treeId, plan.childId);
          const attached = await attachParent(tx, treeId, person.id, plan.childId, plan.alsoSiblings !== false, plan.replacePlaceholder !== false);
          return { person: toGraphPerson(person), ...attached };
        }
        case "spouse": {
          await requirePerson(tx, treeId, plan.personId);
          const union = await insertUnion(tx, treeId, plan.personId, person.id);
          return { person: toGraphPerson(person), parentLinks: [], unions: [union] };
        }
        case "child": {
          const links = await linkChild(tx, treeId, plan.parentId, person.id, plan.unionId);
          return { person: toGraphPerson(person), parentLinks: links, unions: [] };
        }
        case "sibling": {
          const linked = await linkSibling(tx, treeId, plan.personId, person.id);
          return { person: toGraphPerson(person), unions: [], ...linked };
        }
      }
    });
  } catch (error) {
    throw mapWriteError(error);
  }
}

export async function linkPeople(userId: string | null, treeId: string, input: LinkInput): Promise<WriteResult> {
  await requireTreeAdmin(userId, treeId);
  try {
    return await getDb().transaction(async (tx) => {
      const plan = input;
      switch (plan.kind) {
        case "father":
        case "mother": {
          await requirePerson(tx, treeId, plan.parentId);
          await requirePerson(tx, treeId, plan.childId);
          return attachParent(tx, treeId, plan.parentId, plan.childId, plan.alsoSiblings !== false, plan.replacePlaceholder !== false);
        }
        case "spouse": {
          await requirePerson(tx, treeId, plan.personId);
          await requirePerson(tx, treeId, plan.otherId);
          const union = await insertUnion(tx, treeId, plan.personId, plan.otherId);
          return { parentLinks: [], unions: [union] };
        }
        case "child": {
          await requirePerson(tx, treeId, plan.childId);
          const links = await linkChild(tx, treeId, plan.parentId, plan.childId, plan.unionId);
          return { parentLinks: links, unions: [] };
        }
        case "sibling": {
          await requirePerson(tx, treeId, plan.otherId);
          const linked = await linkSibling(tx, treeId, plan.personId, plan.otherId);
          return { unions: [], ...linked };
        }
      }
    });
  } catch (error) {
    throw mapWriteError(error);
  }
}

export async function updateParentLink(userId: string | null, treeId: string, linkId: string, kind: ParentKind): Promise<GraphParentLink> {
  await requireTreeAdmin(userId, treeId);
  const [link] = await getDb()
    .update(parentLinks)
    .set({ kind, updatedAt: new Date() })
    .where(and(eq(parentLinks.id, linkId), eq(parentLinks.treeId, treeId)))
    .returning();
  if (!link) throw new AuthzError("That relationship is not in this tree.", "invalid");
  return toGraphLink(link);
}

export async function updateUnion(
  userId: string | null,
  treeId: string,
  unionId: string,
  patch: { status?: UnionStatus; startDate?: string | null; endDate?: string | null },
): Promise<GraphUnion> {
  await requireTreeAdmin(userId, treeId);
  const [existing] = await getDb().select().from(unions).where(and(eq(unions.id, unionId), eq(unions.treeId, treeId))).limit(1);
  if (!existing) throw new AuthzError("That relationship is not in this tree.", "invalid");
  const startDate = patch.startDate !== undefined ? normalizeOptional(patch.startDate) : existing.startDate;
  const endDate = patch.endDate !== undefined ? normalizeOptional(patch.endDate) : existing.endDate;
  const message = unionDateError(startDate, endDate);
  if (message) throw new AuthzError(message, "invalid");
  const [saved] = await getDb()
    .update(unions)
    .set({
      status: patch.status ?? existing.status,
      startDate,
      endDate,
      updatedAt: new Date(),
    })
    .where(eq(unions.id, unionId))
    .returning();
  if (!saved) throw new AuthzError("That relationship is not in this tree.", "invalid");
  return toGraphUnion(saved);
}

export async function reorderUnions(userId: string | null, treeId: string, personId: string, unionIds: string[]): Promise<GraphUnion[]> {
  await requireTreeAdmin(userId, treeId);
  try {
    return await getDb().transaction(async (tx) => {
      await requirePerson(tx, treeId, personId);
      const rows = await tx
        .select()
        .from(unions)
        .where(and(eq(unions.treeId, treeId), or(eq(unions.personAId, personId), eq(unions.personBId, personId))));
      const allowed = new Set(rows.map((row) => row.id));
      if (unionIds.length !== allowed.size || unionIds.some((id) => !allowed.has(id))) {
        throw new AuthzError("Those spouses do not match this person.", "invalid");
      }
      const saved: GraphUnion[] = [];
      for (let index = 0; index < unionIds.length; index += 1) {
        const unionId = unionIds[index];
        if (!unionId) continue;
        const [row] = await tx.update(unions).set({ sortOrder: index, updatedAt: new Date() }).where(eq(unions.id, unionId)).returning();
        if (row) saved.push(toGraphUnion(row));
      }
      return saved;
    });
  } catch (error) {
    throw mapWriteError(error);
  }
}

export async function unlinkRelationship(
  userId: string | null,
  treeId: string,
  input: { type: "parent"; linkId: string } | { type: "union"; unionId: string },
): Promise<void> {
  await requireTreeAdmin(userId, treeId);
  if (input.type === "parent") {
    const deleted = await getDb()
      .delete(parentLinks)
      .where(and(eq(parentLinks.id, input.linkId), eq(parentLinks.treeId, treeId)))
      .returning({ id: parentLinks.id });
    if (deleted.length === 0) throw new AuthzError("That relationship is not in this tree.", "invalid");
    return;
  }
  const deleted = await getDb()
    .delete(unions)
    .where(and(eq(unions.id, input.unionId), eq(unions.treeId, treeId)))
    .returning({ id: unions.id });
  if (deleted.length === 0) throw new AuthzError("That relationship is not in this tree.", "invalid");
}

export async function deletePerson(userId: string | null, treeId: string, personId: string): Promise<{ nextPersonId: string | null }> {
  await requireTreeAdmin(userId, treeId);
  const db = getDb();
  const [existing] = await db.select({ id: persons.id }).from(persons).where(and(eq(persons.id, personId), eq(persons.treeId, treeId))).limit(1);
  if (!existing) throw new AuthzError("That person is not in this tree.", "invalid");

  const [people, links, pairings] = await Promise.all([
    db.select().from(persons).where(eq(persons.treeId, treeId)),
    db.select().from(parentLinks).where(eq(parentLinks.treeId, treeId)),
    db.select().from(unions).where(eq(unions.treeId, treeId)),
  ]);
  const graph = {
    persons: people.map(toGraphPerson),
    parentLinks: links.map(toGraphLink),
    unions: pairings.map(toGraphUnion),
  };
  const nextPersonId = chooseNextPerson(graph, personId);

  await db.transaction(async (tx) => {
    await tx.delete(parentLinks).where(and(eq(parentLinks.treeId, treeId), or(eq(parentLinks.parentId, personId), eq(parentLinks.childId, personId))));
    await tx.delete(unions).where(and(eq(unions.treeId, treeId), or(eq(unions.personAId, personId), eq(unions.personBId, personId))));
    await tx.delete(persons).where(and(eq(persons.id, personId), eq(persons.treeId, treeId)));
  });

  return { nextPersonId };
}

function chooseNextPerson(graph: { persons: GraphPerson[]; parentLinks: GraphParentLink[]; unions: GraphUnion[] }, personId: string): string | null {
  const index = createGraphIndex(graph);
  const relative =
    parents(index, personId)[0] ??
    spouses(index, personId)[0]?.person ??
    childrenGrouped(index, personId)[0]?.children[0] ??
    siblings(index, personId)[0]?.person;
  if (relative) return relative.id;
  return graph.persons.find((person) => person.id !== personId && !person.isPlaceholder)?.id ?? null;
}

async function requirePerson(tx: Transaction, treeId: string, personId: string) {
  const [row] = await tx.select({ id: persons.id }).from(persons).where(and(eq(persons.id, personId), eq(persons.treeId, treeId))).limit(1);
  if (!row) throw new AuthzError("That person is not in this tree.", "invalid");
}

async function insertLink(
  tx: Transaction,
  value: { treeId: string; parentId: string; childId: string; kind: ParentKind; unionId: string | null },
): Promise<GraphParentLink> {
  if (value.parentId === value.childId) throw new AuthzError("A person cannot be their own parent.", "invalid");
  const [link] = await tx.insert(parentLinks).values(value).returning();
  if (!link) throw new AuthzError("Could not save that relationship.", "invalid");
  return toGraphLink(link);
}

async function insertUnion(tx: Transaction, treeId: string, personAId: string, personBId: string): Promise<GraphUnion> {
  if (personAId === personBId) throw new AuthzError("A person cannot be their own spouse.", "invalid");
  const existing = await tx
    .select({ id: unions.id })
    .from(unions)
    .where(
      and(
        eq(unions.treeId, treeId),
        or(
          and(eq(unions.personAId, personAId), eq(unions.personBId, personBId)),
          and(eq(unions.personAId, personBId), eq(unions.personBId, personAId)),
        ),
      ),
    )
    .limit(1);
  if (existing.length > 0) throw new AuthzError("That relationship already exists.", "invalid");
  const sortOrder = await nextSort(tx, treeId, personAId);
  const [union] = await tx
    .insert(unions)
    .values({ treeId, personAId, personBId, sortOrder, status: "married" })
    .returning();
  if (!union) throw new AuthzError("Could not save that relationship.", "invalid");
  return toGraphUnion(union);
}

async function nextSort(tx: Transaction, treeId: string, personId: string): Promise<number> {
  const rows = await tx
    .select({ sortOrder: unions.sortOrder })
    .from(unions)
    .where(and(eq(unions.treeId, treeId), or(eq(unions.personAId, personId), eq(unions.personBId, personId))));
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
}

async function attachParent(
  tx: Transaction,
  treeId: string,
  parentId: string,
  childId: string,
  alsoSiblings: boolean,
  replacePlaceholder: boolean,
): Promise<WriteResult> {
  const removedPersonIds: string[] = [];
  const links: GraphParentLink[] = [];
  if (replacePlaceholder) {
    const replaced = await replacePlaceholderParent(tx, treeId, childId, parentId);
    links.push(...replaced.parentLinks);
    removedPersonIds.push(...replaced.removedPersonIds);
  }
  const existing = await tx.select().from(parentLinks).where(and(eq(parentLinks.treeId, treeId), eq(parentLinks.childId, childId)));
  const parentIds = existing.map((link) => link.parentId);
  const placeholderIds = new Set(
    parentIds.length === 0
      ? []
      : (
          await tx
            .select({ id: persons.id })
            .from(persons)
            .where(and(eq(persons.treeId, treeId), eq(persons.isPlaceholder, true), inArray(persons.id, parentIds)))
        ).map((row) => row.id),
  );
  const others = existing.filter((link) => link.parentId !== parentId && !placeholderIds.has(link.parentId));
  const createdUnions: GraphUnion[] = [];
  let unionId: string | null = null;
  const other = others.length === 1 ? others[0] : undefined;
  if (other) {
    const found = await findOrCreateUnion(tx, treeId, parentId, other.parentId);
    unionId = found.union.id;
    if (found.created) createdUnions.push(found.union);
    if (other.unionId !== unionId) {
      const [updated] = await tx.update(parentLinks).set({ unionId, updatedAt: new Date() }).where(eq(parentLinks.id, other.id)).returning();
      if (updated) links.push(toGraphLink(updated));
    }
    if (alsoSiblings) {
      const shared = await tx.select().from(parentLinks).where(and(eq(parentLinks.treeId, treeId), eq(parentLinks.parentId, other.parentId)));
      for (const sibling of shared) {
        if (sibling.childId === childId) continue;
        const already = await tx
          .select({ id: parentLinks.id })
          .from(parentLinks)
          .where(and(eq(parentLinks.parentId, parentId), eq(parentLinks.childId, sibling.childId)))
          .limit(1);
        if (already.length > 0) continue;
        links.push(await insertLink(tx, { treeId, parentId, childId: sibling.childId, kind: "biological", unionId }));
        if (sibling.unionId !== unionId) {
          const [updated] = await tx.update(parentLinks).set({ unionId, updatedAt: new Date() }).where(eq(parentLinks.id, sibling.id)).returning();
          if (updated) links.push(toGraphLink(updated));
        }
      }
    }
  }
  const already = existing.find((link) => link.parentId === parentId);
  if (!already) {
    links.push(await insertLink(tx, { treeId, parentId, childId, kind: "biological", unionId }));
  } else if (unionId && already.unionId !== unionId) {
    const [updated] = await tx.update(parentLinks).set({ unionId, updatedAt: new Date() }).where(eq(parentLinks.id, already.id)).returning();
    if (updated) links.push(toGraphLink(updated));
  }
  return { parentLinks: links, unions: createdUnions, removedPersonIds };
}

async function replacePlaceholderParent(
  tx: Transaction,
  treeId: string,
  childId: string,
  parentId: string,
): Promise<{ parentLinks: GraphParentLink[]; removedPersonIds: string[] }> {
  const childLinks = await tx.select().from(parentLinks).where(and(eq(parentLinks.treeId, treeId), eq(parentLinks.childId, childId)));
  const parentIds = childLinks.map((link) => link.parentId);
  if (parentIds.length === 0) return { parentLinks: [], removedPersonIds: [] };
  const placeholders = await tx
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.treeId, treeId), eq(persons.isPlaceholder, true), inArray(persons.id, parentIds)));
  const parentLinksOut: GraphParentLink[] = [];
  const removedPersonIds: string[] = [];
  for (const placeholder of placeholders) {
    const links = await tx.select().from(parentLinks).where(and(eq(parentLinks.treeId, treeId), eq(parentLinks.parentId, placeholder.id)));
    for (const link of links) {
      const clash = await tx
        .select({ id: parentLinks.id })
        .from(parentLinks)
        .where(and(eq(parentLinks.parentId, parentId), eq(parentLinks.childId, link.childId)))
        .limit(1);
      if (clash.length > 0) {
        await tx.delete(parentLinks).where(eq(parentLinks.id, link.id));
        continue;
      }
      const [updated] = await tx.update(parentLinks).set({ parentId, updatedAt: new Date() }).where(eq(parentLinks.id, link.id)).returning();
      if (updated) parentLinksOut.push(toGraphLink(updated));
    }
    await tx.delete(persons).where(and(eq(persons.id, placeholder.id), eq(persons.treeId, treeId)));
    removedPersonIds.push(placeholder.id);
  }
  return { parentLinks: parentLinksOut, removedPersonIds };
}

async function findOrCreateUnion(tx: Transaction, treeId: string, personAId: string, personBId: string): Promise<{ union: GraphUnion; created: boolean }> {
  const existing = await tx
    .select()
    .from(unions)
    .where(
      and(
        eq(unions.treeId, treeId),
        or(
          and(eq(unions.personAId, personAId), eq(unions.personBId, personBId)),
          and(eq(unions.personAId, personBId), eq(unions.personBId, personAId)),
        ),
      ),
    )
    .limit(1);
  const row = existing[0];
  if (row) return { union: toGraphUnion(row), created: false };
  return { union: await insertUnion(tx, treeId, personAId, personBId), created: true };
}

async function linkChild(tx: Transaction, treeId: string, parentId: string, childId: string, unionId: string | null): Promise<GraphParentLink[]> {
  await requirePerson(tx, treeId, parentId);
  const parentIds = [parentId];
  if (unionId) {
    const [union] = await tx.select().from(unions).where(and(eq(unions.id, unionId), eq(unions.treeId, treeId))).limit(1);
    if (!union) throw new AuthzError("That relationship is not in this tree.", "invalid");
    if (union.personAId !== parentId && union.personBId !== parentId) {
      throw new AuthzError("Choose a spouse of this person.", "invalid");
    }
    parentIds.push(union.personAId === parentId ? union.personBId : union.personAId);
  }
  const links: GraphParentLink[] = [];
  for (const id of parentIds) {
    links.push(await insertLink(tx, { treeId, parentId: id, childId, kind: "biological", unionId }));
  }
  return links;
}

async function linkSibling(
  tx: Transaction,
  treeId: string,
  personId: string,
  siblingId: string,
): Promise<{ parentLinks: GraphParentLink[]; persons?: GraphPerson[] }> {
  await requirePerson(tx, treeId, personId);
  if (personId === siblingId) throw new AuthzError("A person cannot be their own sibling.", "invalid");
  const existing = await tx.select().from(parentLinks).where(and(eq(parentLinks.treeId, treeId), eq(parentLinks.childId, personId)));
  if (existing.length === 0) {
    const [placeholder] = await tx
      .insert(persons)
      .values({ treeId, firstName: "Unknown", sex: "unknown", isPlaceholder: true })
      .returning();
    if (!placeholder) throw new AuthzError("Could not add that person.", "invalid");
    const parentLinksOut = [
      await insertLink(tx, { treeId, parentId: placeholder.id, childId: personId, kind: "biological", unionId: null }),
      await insertLink(tx, { treeId, parentId: placeholder.id, childId: siblingId, kind: "biological", unionId: null }),
    ];
    return { parentLinks: parentLinksOut, persons: [toGraphPerson(placeholder)] };
  }
  const links: GraphParentLink[] = [];
  for (const link of existing) {
    const already = await tx
      .select({ id: parentLinks.id })
      .from(parentLinks)
      .where(and(eq(parentLinks.parentId, link.parentId), eq(parentLinks.childId, siblingId)))
      .limit(1);
    if (already.length > 0) continue;
    links.push(
      await insertLink(tx, {
        treeId,
        parentId: link.parentId,
        childId: siblingId,
        kind: link.kind,
        unionId: link.unionId,
      }),
    );
  }
  if (links.length === 0) throw new AuthzError("That relationship already exists.", "invalid");
  return { parentLinks: links };
}

function mapWriteError(error: unknown): never {
  if (error instanceof AuthzError) throw error;
  if (isAncestryCycle(error)) throw new AuthzError("That would make someone their own ancestor", "invalid");
  if (isUniqueViolation(error)) throw new AuthzError("That relationship already exists.", "invalid");
  throw error;
}
