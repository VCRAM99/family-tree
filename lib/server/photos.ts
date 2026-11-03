import "server-only";

import { eq } from "drizzle-orm";

import { persons } from "@/lib/db/schema";
import { isWebp, PHOTO_MAX_BYTES, PHOTO_MIME } from "@/lib/photos";

import { requireTreeAdmin } from "./authz";
import { getDb } from "./db";
import { AuthzError } from "./errors";
import { getPhotoStorage } from "./photo-storage";

export async function savePersonPhoto(userId: string | null, personId: string, bytes: Uint8Array) {
  const [person] = await getDb().select().from(persons).where(eq(persons.id, personId)).limit(1);
  if (!person) throw new AuthzError("Person not found.", "not_found");
  await requireTreeAdmin(userId, person.treeId);

  if (bytes.byteLength === 0 || bytes.byteLength > PHOTO_MAX_BYTES) {
    throw new AuthzError("Photos must be 512 KB or smaller.", "invalid");
  }
  if (!isWebp(bytes)) {
    throw new AuthzError("Upload a WebP image.", "invalid");
  }

  await getPhotoStorage().put(personId, {
    bytes,
    mime: PHOTO_MIME,
    sizeBytes: bytes.byteLength,
  });
  await getDb().update(persons).set({ hasPhoto: true, updatedAt: new Date() }).where(eq(persons.id, personId));
}

export async function removePersonPhoto(userId: string | null, personId: string) {
  const [person] = await getDb().select().from(persons).where(eq(persons.id, personId)).limit(1);
  if (!person) throw new AuthzError("Person not found.", "not_found");
  await requireTreeAdmin(userId, person.treeId);
  await getPhotoStorage().delete(personId);
  await getDb().update(persons).set({ hasPhoto: false, updatedAt: new Date() }).where(eq(persons.id, personId));
}
