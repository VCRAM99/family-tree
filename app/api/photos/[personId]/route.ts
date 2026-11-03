import { eq } from "drizzle-orm";

import { persons } from "@/lib/db/schema";
import { requireTreeAdmin } from "@/lib/server/authz";
import { getDb } from "@/lib/server/db";
import { AuthzError } from "@/lib/server/errors";
import { publicPhotoAllowed } from "@/lib/server/public-tree";
import { getPhotoStorage } from "@/lib/server/photo-storage";
import { getCurrentUser } from "@/lib/server/session";

export async function GET(request: Request, context: { params: Promise<{ personId: string }> }) {
  const { personId } = await context.params;
  const user = await getCurrentUser();
  const [person] = await getDb().select({ treeId: persons.treeId }).from(persons).where(eq(persons.id, personId)).limit(1);
  if (!person) return new Response(null, { status: 404 });

  let admin = false;
  if (user) {
    try {
      await requireTreeAdmin(user.id, person.treeId);
      admin = true;
    } catch (error) {
      if (!(error instanceof AuthzError)) return new Response(null, { status: 404 });
    }
  }
  if (!admin && !(await publicPhotoAllowed(personId))) return new Response(null, { status: 404 });

  const photo = await getPhotoStorage().get(personId);
  if (!photo) return new Response(null, { status: 404 });

  const etag = `W/"${photo.updatedAt.getTime()}-${photo.sizeBytes}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(Buffer.from(photo.bytes), {
    status: 200,
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.sizeBytes),
      ETag: etag,
      "Cache-Control": admin ? "private, max-age=3600" : "public, max-age=3600",
    },
  });
}
