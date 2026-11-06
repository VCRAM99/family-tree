import "server-only";

import { eq } from "drizzle-orm";

import { exportCsv, previewCsv, type CsvPerson } from "@/lib/csv-tree";
import { parentLinks, persons, treeAdmins, trees, unions } from "@/lib/db/schema";
import type { CustomFieldDef } from "@/lib/domain";
import { generateShareCode } from "@/lib/share-code";

import { requireTreeOwner } from "./authz";
import { getDb } from "./db";
import { AuthzError, isUniqueViolation } from "./errors";
import { invalidatePublicTree } from "./public-cache";

export async function exportTreeCsv(userId: string, treeId: string): Promise<string> {
  await requireTreeOwner(userId, treeId);
  const db = getDb();
  const [tree] = await db.select({ customFieldDefs: trees.customFieldDefs }).from(trees).where(eq(trees.id, treeId)).limit(1);
  const people = await db.select().from(persons).where(eq(persons.treeId, treeId));
  const links = await db.select().from(parentLinks).where(eq(parentLinks.treeId, treeId));
  const pairings = await db.select().from(unions).where(eq(unions.treeId, treeId));
  const ordered = [...people].sort((a, b) => a.firstName.localeCompare(b.firstName) || (a.lastName ?? "").localeCompare(b.lastName ?? "") || a.id.localeCompare(b.id));
  const refs = new Map(ordered.map((person, index) => [person.id, String(index + 1)]));
  const rows: CsvPerson[] = ordered.map((person) => ({
    ref: refs.get(person.id) ?? "",
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    preferredName: person.preferredName,
    birthSurname: person.birthSurname,
    sex: person.sex,
    birthDate: person.birthDate,
    birthDatePrecision: person.birthDatePrecision,
    deathDate: person.deathDate,
    deathDatePrecision: person.deathDatePrecision,
    isDeceased: person.isDeceased,
    birthPlace: person.birthPlace,
    nativePlace: person.nativePlace,
    currentLocation: person.currentLocation,
    occupation: person.occupation,
    bio: person.bio,
    phoneWhatsapp: person.phoneWhatsapp,
    email: person.email,
    instagram: person.instagram,
    facebook: person.facebook,
    customFields: Object.fromEntries(
      Object.entries(person.customFields ?? {}).map(([key, value]) => [key, value == null ? null : String(value)]),
    ),
  }));
  const csvLinks = links.flatMap((link) => {
    const parentRef = refs.get(link.parentId);
    const childRef = refs.get(link.childId);
    return parentRef && childRef ? [{ parentRef, childRef }] : [];
  });
  const csvUnions = pairings.flatMap((union) => {
    const a = refs.get(union.personAId);
    const b = refs.get(union.personBId);
    if (!a || !b) return [];
    return [a < b ? { a, b } : { a: b, b: a }];
  });
  return exportCsv(rows, csvLinks, csvUnions, (tree?.customFieldDefs ?? []) as CustomFieldDef[]);
}

/** Creates a new tree from CSV. Refuses to write when the preview has errors. */
export async function importCsvTree(userId: string, email: string, csv: string, name: string): Promise<{ id: string }> {
  const plan = previewCsv(csv);
  if (plan.errors.length > 0) {
    throw new AuthzError(plan.errors.map((error) => error.message).join(" "), "invalid");
  }
  const trimmed = name.trim() || "Imported tree";
  if (trimmed.length > 80) throw new AuthzError("Keep the tree name under 80 characters.", "invalid");
  const ids = new Map(plan.people.map((person) => [person.ref, crypto.randomUUID()]));
  const unionIds = new Map(plan.unions.map((union) => [`${union.a}|${union.b}`, crypto.randomUUID()]));
  const db = getDb();
  let createdId = "";
  let shareCode = generateShareCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    void attempt;
    try {
      createdId = await db.transaction(async (tx) => {
        const [tree] = await tx
          .insert(trees)
          .values({
            ownerId: userId,
            name: trimmed,
            shareCode,
            customFieldDefs: plan.customFieldDefs,
          })
          .returning({ id: trees.id });
        if (!tree) throw new AuthzError("Could not create the tree.", "invalid");
        await tx.insert(treeAdmins).values({
          treeId: tree.id,
          userId,
          invitedEmail: email,
          role: "owner",
          status: "accepted",
        });
        if (plan.people.length > 0) {
          await tx.insert(persons).values(
            plan.people.map((person) => ({
              id: ids.get(person.ref)!,
              treeId: tree.id,
              firstName: person.firstName,
              middleName: person.middleName,
              lastName: person.lastName,
              preferredName: person.preferredName,
              birthSurname: person.birthSurname,
              sex: person.sex,
              birthDate: person.birthDate,
              birthDatePrecision: person.birthDatePrecision,
              deathDate: person.deathDate,
              deathDatePrecision: person.deathDatePrecision,
              isDeceased: person.isDeceased,
              birthPlace: person.birthPlace,
              nativePlace: person.nativePlace,
              currentLocation: person.currentLocation,
              occupation: person.occupation,
              bio: person.bio,
              phoneWhatsapp: person.phoneWhatsapp,
              email: person.email,
              instagram: person.instagram,
              facebook: person.facebook,
              customFields: person.customFields,
              createdBy: userId,
            })),
          );
        }
        if (plan.unions.length > 0) {
          await tx.insert(unions).values(
            plan.unions.map((union, index) => ({
              id: unionIds.get(`${union.a}|${union.b}`)!,
              treeId: tree.id,
              personAId: ids.get(union.a)!,
              personBId: ids.get(union.b)!,
              status: "married" as const,
              sortOrder: index,
            })),
          );
        }
        if (plan.links.length > 0) {
          await tx.insert(parentLinks).values(
            plan.links.map((link) => ({
              treeId: tree.id,
              parentId: ids.get(link.parentRef)!,
              childId: ids.get(link.childRef)!,
              kind: "biological" as const,
              unionId: coupleId(plan.links, link, unionIds),
            })),
          );
        }
        return tree.id;
      });
      break;
    } catch (error) {
      if (isUniqueViolation(error) && /share_code/i.test(constraintName(error))) {
        shareCode = generateShareCode();
        continue;
      }
      throw error;
    }
  }
  if (!createdId) throw new AuthzError("Could not assign a new share code. Try the import again.", "invalid");
  invalidatePublicTree(createdId);
  return { id: createdId };
}

function coupleId(
  links: { parentRef: string; childRef: string }[],
  link: { parentRef: string; childRef: string },
  unionIds: Map<string, string>,
): string | null {
  const other = links.find((item) => item.childRef === link.childRef && item.parentRef !== link.parentRef);
  if (!other) return null;
  const [a, b] = link.parentRef < other.parentRef ? [link.parentRef, other.parentRef] : [other.parentRef, link.parentRef];
  return unionIds.get(`${a}|${b}`) ?? null;
}

function constraintName(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if ("constraint" in current && typeof current.constraint === "string") return current.constraint;
    current = "cause" in current ? current.cause : null;
  }
  return "";
}
