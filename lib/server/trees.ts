import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { treeAdmins, trees } from "@/lib/db/schema";
import { isValidPublicTag, normalizePublicTag } from "@/lib/public-tag";
import { generateShareCode } from "@/lib/share-code";
import { isThemeId, type ThemeId } from "@/lib/themes";
import {
  createTreeSchema,
  resolvedPublicTag,
  settingsSchema,
  uniqueVisibleFields,
  type SettingsInput,
} from "@/lib/validation";

import type { TreeListItem } from "@/lib/tree-list";

import { requireTreeAdmin, requireTreeOwner } from "./authz";
import { getDb } from "./db";
import { AuthzError, isUniqueViolation } from "./errors";

export type { TreeListItem } from "@/lib/tree-list";

async function withShareCodeRetry<T>(attempt: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let tryNumber = 0; tryNumber < 8; tryNumber += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not generate a share code.");
}

export async function listMyTrees(userId: string): Promise<TreeListItem[]> {
  const rows = await getDb()
    .select({
      id: trees.id,
      name: trees.name,
      description: trees.description,
      visibility: trees.visibility,
      role: treeAdmins.role,
      shareCode: trees.shareCode,
      updatedAt: trees.updatedAt,
    })
    .from(treeAdmins)
    .innerJoin(trees, eq(trees.id, treeAdmins.treeId))
    .where(and(eq(treeAdmins.userId, userId), eq(treeAdmins.status, "accepted")));

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      role: row.role,
      shareCode: row.shareCode.trim(),
      updatedAt: row.updatedAt.toISOString(),
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createTree(userId: string, email: string, input: { name: string; description?: string }) {
  const parsed = createTreeSchema.parse({
    name: input.name,
    description: input.description ?? "",
  });
  const description = parsed.description.length > 0 ? parsed.description : null;

  return withShareCodeRetry(async () => {
    return getDb().transaction(async (tx) => {
      const [tree] = await tx
        .insert(trees)
        .values({
          ownerId: userId,
          name: parsed.name,
          description,
          shareCode: generateShareCode(),
        })
        .returning();
      if (!tree) throw new Error("Could not create the tree.");
      await tx.insert(treeAdmins).values({
        treeId: tree.id,
        userId,
        invitedEmail: email,
        role: "owner",
        status: "accepted",
      });
      return tree;
    });
  });
}

export async function readTree(userId: string | null, treeId: string) {
  await requireTreeAdmin(userId, treeId);
  const [tree] = await getDb().select().from(trees).where(eq(trees.id, treeId)).limit(1);
  if (!tree) throw new AuthzError("Tree not found.", "not_found");
  return tree;
}

export async function renameTree(userId: string | null, treeId: string, name: string) {
  await requireTreeAdmin(userId, treeId);
  const parsed = createTreeSchema.shape.name.parse(name);
  const [tree] = await getDb()
    .update(trees)
    .set({ name: parsed, updatedAt: new Date() })
    .where(eq(trees.id, treeId))
    .returning();
  if (!tree) throw new AuthzError("Tree not found.", "not_found");
  return tree;
}

export async function deleteTree(userId: string | null, treeId: string, confirmationName: string) {
  await requireTreeOwner(userId, treeId);
  const [tree] = await getDb().select().from(trees).where(eq(trees.id, treeId)).limit(1);
  if (!tree) throw new AuthzError("Tree not found.", "not_found");
  if (confirmationName !== tree.name) {
    throw new AuthzError("Type the tree’s name exactly to delete it.", "invalid");
  }
  await getDb().delete(trees).where(eq(trees.id, treeId));
}

export async function changeTreeVisibility(
  userId: string | null,
  treeId: string,
  visibility: "private" | "unlisted" | "public",
  publicTag: string | null,
) {
  await requireTreeOwner(userId, treeId);
  let tag: string | null;
  try {
    tag = resolvedPublicTag(visibility, publicTag ?? "");
  } catch (error) {
    throw new AuthzError(error instanceof Error ? error.message : "That tag is not valid.", "invalid");
  }

  if (tag) {
    const [taken] = await getDb()
      .select({ id: trees.id })
      .from(trees)
      .where(and(sql`lower(${trees.publicTag}) = ${tag}`, sql`${trees.id} <> ${treeId}`))
      .limit(1);
    if (taken) throw new AuthzError("That public tag is already in use.", "invalid");
  }

  try {
    const [tree] = await getDb()
      .update(trees)
      .set({ visibility, publicTag: tag, updatedAt: new Date() })
      .where(eq(trees.id, treeId))
      .returning();
    if (!tree) throw new AuthzError("Tree not found.", "not_found");
    return tree;
  } catch (error) {
    if (error instanceof AuthzError) throw error;
    if (isUniqueViolation(error)) throw new AuthzError("That public tag is already in use.", "invalid");
    throw error;
  }
}

export async function updateTreeSettings(userId: string | null, treeId: string, input: SettingsInput) {
  const role = await requireTreeAdmin(userId, treeId);
  const parsed = settingsSchema.parse(input);
  const current = await readTree(userId, treeId);
  const nextTag = (() => {
    try {
      return resolvedPublicTag(parsed.visibility, parsed.publicTag);
    } catch (error) {
      throw new AuthzError(error instanceof Error ? error.message : "That tag is not valid.", "invalid");
    }
  })();

  const visibilityChanged = parsed.visibility !== current.visibility || (nextTag ?? null) !== (current.publicTag ?? null);
  if (visibilityChanged && role !== "owner") {
    throw new AuthzError("Only the owner can change visibility.", "forbidden");
  }

  if (nextTag) {
    const [taken] = await getDb()
      .select({ id: trees.id })
      .from(trees)
      .where(and(sql`lower(${trees.publicTag}) = ${nextTag}`, sql`${trees.id} <> ${treeId}`))
      .limit(1);
    if (taken) throw new AuthzError("That public tag is already in use.", "invalid");
  }

  try {
    const [tree] = await getDb()
      .update(trees)
      .set({
        name: parsed.name,
        description: parsed.description.length > 0 ? parsed.description : null,
        visibility: parsed.visibility,
        publicTag: nextTag,
        allowSuggestions: parsed.allowSuggestions,
        socialsEnabled: parsed.socialsEnabled,
        photosEnabled: parsed.photosEnabled,
        hideLivingDetails: parsed.hideLivingDetails,
        visibleFields: uniqueVisibleFields(parsed.visibleFields),
        theme: parsed.theme,
        customFieldDefs: parsed.customFieldDefs,
        updatedAt: new Date(),
      })
      .where(eq(trees.id, treeId))
      .returning();
    if (!tree) throw new AuthzError("Tree not found.", "not_found");
    return tree;
  } catch (error) {
    if (error instanceof AuthzError) throw error;
    if (isUniqueViolation(error)) throw new AuthzError("That public tag is already in use.", "invalid");
    throw error;
  }
}

export async function regenerateShareCode(userId: string | null, treeId: string) {
  await requireTreeAdmin(userId, treeId);
  return withShareCodeRetry(async () => {
    const [tree] = await getDb()
      .update(trees)
      .set({ shareCode: generateShareCode(), updatedAt: new Date() })
      .where(eq(trees.id, treeId))
      .returning();
    if (!tree) throw new AuthzError("Tree not found.", "not_found");
    return tree.shareCode;
  });
}

export async function publicTagAvailability(userId: string | null, treeId: string, tag: string) {
  await requireTreeOwner(userId, treeId);
  const normalized = normalizePublicTag(tag);
  if (!normalized) return { valid: false, available: false, message: "Enter a public tag." };
  if (!isValidPublicTag(normalized)) {
    return { valid: false, available: false, message: "Use 3–40 letters, numbers, or hyphens." };
  }
  const [taken] = await getDb()
    .select({ id: trees.id })
    .from(trees)
    .where(and(sql`lower(${trees.publicTag}) = ${normalized}`, sql`${trees.id} <> ${treeId}`))
    .limit(1);
  if (taken) return { valid: true, available: false, message: "That tag is already in use." };
  return { valid: true, available: true, message: "That tag is available." };
}

export async function inviteTreeAdmin(actorId: string | null, treeId: string, email: string) {
  await requireTreeOwner(actorId, treeId);
  const invitedEmail = email.trim().toLowerCase();
  if (!invitedEmail.includes("@")) throw new AuthzError("Enter an email address.", "invalid");
  await getDb().insert(treeAdmins).values({
    treeId,
    invitedEmail,
    role: "admin",
    status: "pending",
  });
}

export async function getTreeTheme(treeId: string): Promise<ThemeId> {
  const [row] = await getDb().select({ theme: trees.theme }).from(trees).where(eq(trees.id, treeId)).limit(1);
  if (row && isThemeId(row.theme)) return row.theme;
  return "system";
}
