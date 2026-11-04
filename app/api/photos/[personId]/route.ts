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

  const storage = getPhotoStorage();
  const meta = await storage.stat(personId);
  if (!meta) return new Response(null, { status: 404 });

  const etag = `W/"${meta.updatedAt.getTime()}-${meta.sizeBytes}"`;
  const versioned = new URL(request.url).searchParams.has("v");
  const cacheControl = versioned
    ? `${admin ? "private" : "public"}, max-age=31536000, immutable`
    : `${admin ? "private" : "public"}, max-age=3600`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }

  const photo = await storage.get(personId);
  if (!photo) return new Response(null, { status: 404 });

  return new Response(Buffer.from(photo.bytes), {
    status: 200,
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.sizeBytes),
      ETag: etag,
      "Cache-Control": cacheControl,
    },
  });
}
