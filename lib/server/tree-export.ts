import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { parentLinks, personPhotos, persons, treeAdmins, trees, unions } from "@/lib/db/schema";
import type { CustomFieldDef, PersonField } from "@/lib/domain";
import { personGraphColumns } from "@/lib/server/person-columns";
import { generateShareCode } from "@/lib/share-code";
import { customFieldDefSchema, themeSchema, visibilitySchema } from "@/lib/validation";

import { requireTreeOwner } from "./authz";
import { getDb } from "./db";
import { AuthzError, isUniqueViolation } from "./errors";
import { invalidatePublicTree } from "./public-cache";

const exportedPerson = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(80),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  preferredName: z.string().nullable(),
  birthSurname: z.string().nullable(),
  sex: z.enum(["male", "female", "other", "unknown"]),
  birthDate: z.string().nullable(),
  birthDatePrecision: z.enum(["exact", "month", "year", "approx"]).nullable(),
  deathDate: z.string().nullable(),
  deathDatePrecision: z.enum(["exact", "month", "year", "approx"]).nullable(),
  isDeceased: z.boolean(),
  birthPlace: z.string().nullable(),
  nativePlace: z.string().nullable(),
  currentLocation: z.string().nullable(),
  occupation: z.string().nullable(),
  bio: z.string().nullable(),
  hasPhoto: z.boolean(),
  phoneWhatsapp: z.string().nullable(),
  email: z.string().nullable(),
  instagram: z.string().nullable(),
  facebook: z.string().nullable(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  isPlaceholder: z.boolean().default(false),
});

const treeExportSchema = z.object({
  version: z.literal(1),
  tree: z.object({
    name: z.string().min(1).max(80),
    description: z.string().nullable(),
    visibility: visibilitySchema,
    publicTag: z.string().nullable(),
    allowSuggestions: z.boolean(),
    socialsEnabled: z.boolean(),
    photosEnabled: z.boolean(),
    hideLivingDetails: z.boolean(),
    notifySuggestions: z.boolean(),
    visibleFields: z.array(z.string()),
    theme: themeSchema,
    customFieldDefs: z.array(customFieldDefSchema),
  }),
  persons: z.array(exportedPerson),
  parentLinks: z.array(
    z.object({
      id: z.string().uuid(),
      parentId: z.string().uuid(),
      childId: z.string().uuid(),
      kind: z.enum(["biological", "adoptive", "step", "foster"]),
      unionId: z.string().uuid().nullable(),
    }),
  ),
  unions: z.array(
    z.object({
      id: z.string().uuid(),
      personAId: z.string().uuid(),
      personBId: z.string().uuid(),
      status: z.enum(["married", "divorced", "widowed", "partner"]),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      sortOrder: z.number().int(),
    }),
  ),
  photos: z
    .array(
      z.object({
        personId: z.string().uuid(),
        mime: z.literal("image/webp"),
        base64: z.string(),
      }),
    )
    .optional(),
});

export type TreeExportFile = z.infer<typeof treeExportSchema>;

function constraintName(error: unknown): string {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("constraint" in current && typeof current.constraint === "string") return current.constraint;
    if ("message" in current && typeof current.message === "string" && /share_code|public_tag/i.test(current.message)) return current.message;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return "";
}

export async function exportTree(userId: string | null, treeId: string, options?: { photos?: boolean }): Promise<TreeExportFile> {
  await requireTreeOwner(userId, treeId);
  const db = getDb();
  const [tree] = await db.select().from(trees).where(eq(trees.id, treeId)).limit(1);
  if (!tree) throw new AuthzError("Tree not found.", "not_found");
  const [people, links, pairings] = await Promise.all([
    db.select(personGraphColumns).from(persons).where(eq(persons.treeId, treeId)),
    db
      .select({
        id: parentLinks.id,
        parentId: parentLinks.parentId,
        childId: parentLinks.childId,
        kind: parentLinks.kind,
        unionId: parentLinks.unionId,
      })
      .from(parentLinks)
      .where(eq(parentLinks.treeId, treeId)),
    db
      .select({
        id: unions.id,
        personAId: unions.personAId,
        personBId: unions.personBId,
        status: unions.status,
        startDate: unions.startDate,
        endDate: unions.endDate,
        sortOrder: unions.sortOrder,
      })
      .from(unions)
      .where(eq(unions.treeId, treeId)),
  ]);
  const photos = options?.photos
    ? await db
        .select({ personId: personPhotos.personId, mime: personPhotos.mime, bytes: personPhotos.bytes })
        .from(personPhotos)
        .innerJoin(persons, eq(persons.id, personPhotos.personId))
        .where(eq(persons.treeId, treeId))
    : [];

  return {
    version: 1,
    tree: {
      name: tree.name,
      description: tree.description,
      visibility: tree.visibility,
      publicTag: tree.publicTag,
      allowSuggestions: tree.allowSuggestions,
      socialsEnabled: tree.socialsEnabled,
      photosEnabled: tree.photosEnabled,
      hideLivingDetails: tree.hideLivingDetails,
      notifySuggestions: tree.notifySuggestions,
      visibleFields: tree.visibleFields,
      theme: themeSchema.parse(tree.theme),
      customFieldDefs: tree.customFieldDefs as CustomFieldDef[],
    },
    persons: people.map((person) => ({
      ...person,
      customFields: person.customFields ?? {},
      isPlaceholder: person.isPlaceholder,
    })),
    parentLinks: links,
    unions: pairings,
    ...(options?.photos
      ? {
          photos: photos.map((photo) => ({
            personId: photo.personId,
            mime: "image/webp" as const,
            base64: Buffer.from(photo.bytes).toString("base64"),
          })),
        }
      : {}),
  };
}

/** Creates a new tree. Never updates an existing one. Share codes are always new. */
export async function importTree(userId: string, email: string, input: unknown): Promise<{ id: string }> {
  const parsed = treeExportSchema.parse(input);
  const personIds = new Map(parsed.persons.map((person) => [person.id, crypto.randomUUID()]));
  const unionIds = new Map(parsed.unions.map((union) => [union.id, crypto.randomUUID()]));
  for (const person of parsed.persons) {
    if (!personIds.has(person.id)) throw new AuthzError("That export is missing a person.", "invalid");
  }
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
          name: parsed.tree.name,
          description: parsed.tree.description,
          visibility: parsed.tree.visibility,
          publicTag: parsed.tree.publicTag,
          shareCode,
          allowSuggestions: parsed.tree.allowSuggestions,
          socialsEnabled: parsed.tree.socialsEnabled,
          photosEnabled: parsed.tree.photosEnabled,
          hideLivingDetails: parsed.tree.hideLivingDetails,
          notifySuggestions: parsed.tree.notifySuggestions,
          visibleFields: parsed.tree.visibleFields as PersonField[],
          theme: parsed.tree.theme,
          customFieldDefs: parsed.tree.customFieldDefs,
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
      if (parsed.persons.length > 0) {
        await tx.insert(persons).values(
          parsed.persons.map((person) => ({
            id: personIds.get(person.id)!,
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
            hasPhoto: person.hasPhoto,
            phoneWhatsapp: person.phoneWhatsapp,
            email: person.email,
            instagram: person.instagram,
            facebook: person.facebook,
            customFields: person.customFields,
            isPlaceholder: person.isPlaceholder,
            createdBy: userId,
          })),
        );
      }
      if (parsed.unions.length > 0) {
        await tx.insert(unions).values(
          parsed.unions.map((union) => ({
            id: unionIds.get(union.id)!,
            treeId: tree.id,
            personAId: personIds.get(union.personAId)!,
            personBId: personIds.get(union.personBId)!,
            status: union.status,
            startDate: union.startDate,
            endDate: union.endDate,
            sortOrder: union.sortOrder,
          })),
        );
      }
      if (parsed.parentLinks.length > 0) {
        await tx.insert(parentLinks).values(
          parsed.parentLinks.map((link) => ({
            treeId: tree.id,
            parentId: personIds.get(link.parentId)!,
            childId: personIds.get(link.childId)!,
            kind: link.kind,
            unionId: link.unionId ? (unionIds.get(link.unionId) ?? null) : null,
          })),
        );
      }
      for (const photo of parsed.photos ?? []) {
        const personId = personIds.get(photo.personId);
        if (!personId) continue;
        const bytes = Uint8Array.from(Buffer.from(photo.base64, "base64"));
        await tx.insert(personPhotos).values({
          personId,
          mime: photo.mime,
          bytes,
          sizeBytes: bytes.byteLength,
        });
      }
      return tree.id;
    });
  } catch (error) {
    if (isUniqueViolation(error) && /share_code/i.test(constraintName(error))) {
      shareCode = generateShareCode();
      continue;
    }
    if (isUniqueViolation(error)) {
      throw new AuthzError("That public tag is already in use. Import does not overwrite an existing tree.", "invalid");
    }
    throw error;
  }
  break;
  }
  if (!createdId) throw new AuthzError("Could not assign a new share code. Try the import again.", "invalid");
  invalidatePublicTree(createdId);
  return { id: createdId };
}
