import "server-only";

import { eq } from "drizzle-orm";

import { personPhotos } from "@/lib/db/schema";
import { isWebp, PHOTO_MAX_BYTES, PHOTO_MIME } from "@/lib/photos";

import type { AppDatabase } from "./db";
import { getDb } from "./db";

export type StoredPhoto = {
  bytes: Uint8Array;
  mime: typeof PHOTO_MIME;
  sizeBytes: number;
  updatedAt: Date;
};

export type PhotoMeta = {
  mime: typeof PHOTO_MIME;
  sizeBytes: number;
  updatedAt: Date;
};

export interface PhotoStorage {
  put(personId: string, photo: { bytes: Uint8Array; mime: typeof PHOTO_MIME; sizeBytes: number }): Promise<void>;
  /** ETag metadata only. Does not read the bytea column. */
  stat(personId: string): Promise<PhotoMeta | null>;
  get(personId: string): Promise<StoredPhoto | null>;
  delete(personId: string): Promise<void>;
}

export function createPostgresPhotoStorage(db: AppDatabase): PhotoStorage {
  return {
    async put(personId, photo) {
      if (photo.mime !== PHOTO_MIME) throw new Error("Photos must be image/webp.");
      if (photo.sizeBytes > PHOTO_MAX_BYTES || photo.bytes.byteLength > PHOTO_MAX_BYTES) {
        throw new Error("Photos must be 512 KB or smaller.");
      }
      if (!isWebp(photo.bytes)) throw new Error("That file is not a WebP image.");
      const updatedAt = new Date();
      await db
        .insert(personPhotos)
        .values({
          personId,
          mime: photo.mime,
          bytes: photo.bytes,
          sizeBytes: photo.sizeBytes,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: personPhotos.personId,
          set: {
            mime: photo.mime,
            bytes: photo.bytes,
            sizeBytes: photo.sizeBytes,
            updatedAt,
          },
        });
    },
    async stat(personId) {
      const [row] = await db
        .select({
          mime: personPhotos.mime,
          sizeBytes: personPhotos.sizeBytes,
          updatedAt: personPhotos.updatedAt,
        })
        .from(personPhotos)
        .where(eq(personPhotos.personId, personId))
        .limit(1);
      if (!row || row.mime !== PHOTO_MIME) return null;
      return { mime: PHOTO_MIME, sizeBytes: row.sizeBytes, updatedAt: row.updatedAt };
    },
    async get(personId) {
      const [row] = await db
        .select({
          bytes: personPhotos.bytes,
          mime: personPhotos.mime,
          sizeBytes: personPhotos.sizeBytes,
          updatedAt: personPhotos.updatedAt,
        })
        .from(personPhotos)
        .where(eq(personPhotos.personId, personId))
        .limit(1);
      if (!row || row.mime !== PHOTO_MIME) return null;
      return {
        bytes: row.bytes,
        mime: PHOTO_MIME,
        sizeBytes: row.sizeBytes,
        updatedAt: row.updatedAt,
      };
    },
    async delete(personId) {
      await db.delete(personPhotos).where(eq(personPhotos.personId, personId));
    },
  };
}

export function getPhotoStorage(): PhotoStorage {
  return createPostgresPhotoStorage(getDb());
}
