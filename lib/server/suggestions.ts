import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { persons, suggestions, trees, user } from "@/lib/db/schema";
import type { RelationInput } from "@/lib/person-edits";
import type { PersonPatch } from "@/lib/person-edits";
import { contactError, createSuggestionSchema } from "@/lib/validation";

import { requireTreeAdmin } from "./authz";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { brandedEmail } from "./email-templates";
import { AuthzError } from "./errors";
import { createPersonWithRelation, updatePerson, type WriteExecutor } from "./person-writes";

const DAILY_LIMIT = 20;

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
    .select({
      id: trees.id,
      name: trees.name,
      allowSuggestions: trees.allowSuggestions,
      socialsEnabled: trees.socialsEnabled,
      notifySuggestions: trees.notifySuggestions,
      ownerId: trees.ownerId,
    })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);
  if (!tree) throw new AuthzError("Tree not found.", "not_found");
  if (!tree.allowSuggestions) {
    throw new AuthzError("This tree is not accepting suggestions.", "forbidden");
  }
  if (parsed.type === "contact_update" && !tree.socialsEnabled) {
    throw new AuthzError("This tree is not collecting contact details.", "forbidden");
  }
  if (parsed.type === "contact_update") {
    const payload = contactPayload(parsed.payload ?? {});
    const message = contactError({
      phoneWhatsapp: payload.phoneWhatsapp ?? null,
      email: payload.email ?? null,
      instagram: payload.instagram ?? null,
      facebook: payload.facebook ?? null,
    });
    if (message) throw new AuthzError(message, "invalid");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [countRow] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(suggestions)
    .where(and(eq(suggestions.treeId, treeId), eq(suggestions.submittedBy, userId), gte(suggestions.createdAt, since)));
  if ((countRow?.count ?? 0) >= DAILY_LIMIT) {
    throw new AuthzError("You have sent enough suggestions on this tree for today.", "forbidden");
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

  if (tree.notifySuggestions) {
    const [owner] = await getDb().select({ email: user.email }).from(user).where(eq(user.id, tree.ownerId)).limit(1);
    if (owner?.email) {
      const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const href = `${origin}/tree/${tree.id}/suggestions`;
      const message = brandedEmail({
        subject: `New suggestion on ${tree.name}`,
        eyebrow: tree.name,
        title: "A new suggestion is waiting",
        paragraphs: [`Someone suggested a change on ${tree.name}.`],
        action: { label: "Review suggestions", href },
      });
      void sendEmail({ to: owner.email, ...message }).catch((error: unknown) => {
        console.error("[email] suggestion notice failed", error);
      });
    }
  }

  return suggestion;
}

export async function listSuggestions(userId: string | null, treeId: string) {
  await requireTreeAdmin(userId, treeId);
  const rows = await getDb()
    .select({
      id: suggestions.id,
      type: suggestions.type,
      status: suggestions.status,
      payload: suggestions.payload,
      targetPersonId: suggestions.targetPersonId,
      createdAt: suggestions.createdAt,
      reviewedAt: suggestions.reviewedAt,
      submitterName: user.name,
      submitterEmail: user.email,
    })
    .from(suggestions)
    .innerJoin(user, eq(user.id, suggestions.submittedBy))
    .where(eq(suggestions.treeId, treeId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function pendingSuggestionCount(userId: string | null, treeId: string): Promise<number> {
  await requireTreeAdmin(userId, treeId);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(suggestions)
    .where(and(eq(suggestions.treeId, treeId), eq(suggestions.status, "pending")));
  return row?.count ?? 0;
}

export async function rejectSuggestion(userId: string | null, treeId: string, suggestionId: string) {
  await requireTreeAdmin(userId, treeId);
  const [row] = await getDb()
    .update(suggestions)
    .set({ status: "rejected", reviewedBy: userId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(suggestions.id, suggestionId), eq(suggestions.treeId, treeId), eq(suggestions.status, "pending")))
    .returning();
  if (!row) throw new AuthzError("That suggestion is not waiting for review.", "not_found");
  return row;
}

/** Apply a pending suggestion with the same writes as edit mode, then mark it reviewed. */
export async function approveSuggestion(
  userId: string | null,
  treeId: string,
  suggestionId: string,
  payloadOverride?: Record<string, unknown>,
) {
  await requireTreeAdmin(userId, treeId);
  const [existing] = await getDb()
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.id, suggestionId), eq(suggestions.treeId, treeId)))
    .limit(1);
  if (!existing || existing.status !== "pending") throw new AuthzError("That suggestion is not waiting for review.", "not_found");
  const payload = payloadOverride ?? existing.payload ?? {};

  await getDb().transaction(async (tx) => {
    await applyPayload(userId, treeId, existing.type, existing.targetPersonId, payload, tx);
    const [updated] = await tx
      .update(suggestions)
      .set({
        status: "approved",
        payload,
        reviewedBy: userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(suggestions.id, suggestionId), eq(suggestions.status, "pending")))
      .returning();
    if (!updated) throw new AuthzError("That suggestion is not waiting for review.", "not_found");
  });
}

async function applyPayload(
  userId: string | null,
  treeId: string,
  type: "new_person" | "contact_update" | "correction",
  targetPersonId: string | null,
  payload: Record<string, unknown>,
  tx: WriteExecutor,
) {
  if (type === "new_person") {
    const firstName = typeof payload.firstName === "string" ? payload.firstName.trim() : "";
    if (!firstName) throw new AuthzError("A suggested person needs a first name.", "invalid");
    if (!targetPersonId) throw new AuthzError("Choose who this person is related to.", "invalid");
    const relation = relationFromPayload(targetPersonId, payload);
    await createPersonWithRelation(
      userId,
      treeId,
      {
        firstName,
        middleName: stringOrNull(payload.middleName),
        lastName: stringOrNull(payload.lastName),
        sex: sexOrUndefined(payload.sex),
      },
      relation,
      tx,
    );
    return;
  }
  if (!targetPersonId) throw new AuthzError("Choose the person this suggestion is about.", "invalid");
  const patch: PersonPatch =
    type === "contact_update"
      ? {
          phoneWhatsapp: stringOrNull(payload.phoneWhatsapp),
          email: stringOrNull(payload.email),
          instagram: stringOrNull(payload.instagram),
          facebook: stringOrNull(payload.facebook),
          currentLocation: stringOrNull(payload.currentLocation),
        }
      : patchFromPayload(payload);
  await updatePerson(userId, treeId, targetPersonId, patch, tx);
}

function relationFromPayload(targetPersonId: string, payload: Record<string, unknown>): RelationInput {
  const relation = payload.relation;
  if (relation === "spouse") return { kind: "spouse", personId: targetPersonId };
  if (relation === "child") return { kind: "child", parentId: targetPersonId, unionId: null };
  if (relation === "sibling") return { kind: "sibling", personId: targetPersonId };
  if (relation === "parent") {
    const role = payload.parentRole === "mother" ? "mother" : "father";
    return { kind: role, childId: targetPersonId, alsoSiblings: true, replacePlaceholder: true };
  }
  throw new AuthzError("Choose how this person is related.", "invalid");
}

function patchFromPayload(payload: Record<string, unknown>): PersonPatch {
  const source = payload.patch && typeof payload.patch === "object" ? (payload.patch as Record<string, unknown>) : payload;
  const patch: PersonPatch = {};
  if (typeof source.firstName === "string" && source.firstName.trim()) patch.firstName = source.firstName.trim();
  for (const key of ["middleName", "lastName", "preferredName", "birthSurname", "birthPlace", "nativePlace", "currentLocation", "occupation", "bio"] as const) {
    if (key in source) patch[key] = stringOrNull(source[key]);
  }
  if (source.sex === "male" || source.sex === "female" || source.sex === "other" || source.sex === "unknown") patch.sex = source.sex;
  if ("birthDate" in source) patch.birthDate = stringOrNull(source.birthDate);
  if ("deathDate" in source) patch.deathDate = stringOrNull(source.deathDate);
  if (source.birthDatePrecision === "exact" || source.birthDatePrecision === "month" || source.birthDatePrecision === "year" || source.birthDatePrecision === "approx" || source.birthDatePrecision === null) {
    patch.birthDatePrecision = source.birthDatePrecision;
  }
  if (source.deathDatePrecision === "exact" || source.deathDatePrecision === "month" || source.deathDatePrecision === "year" || source.deathDatePrecision === "approx" || source.deathDatePrecision === null) {
    patch.deathDatePrecision = source.deathDatePrecision;
  }
  if (typeof source.isDeceased === "boolean") patch.isDeceased = source.isDeceased;
  return patch;
}

function contactPayload(payload: Record<string, unknown>) {
  return {
    phoneWhatsapp: stringOrNull(payload.phoneWhatsapp) ?? undefined,
    email: stringOrNull(payload.email) ?? undefined,
    instagram: stringOrNull(payload.instagram) ?? undefined,
    facebook: stringOrNull(payload.facebook) ?? undefined,
  };
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sexOrUndefined(value: unknown) {
  if (value === "male" || value === "female" || value === "other" || value === "unknown") return value;
  return undefined;
}
