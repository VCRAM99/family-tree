"use server";

import { actionError } from "@/lib/server/errors";
import { savePersonPhoto } from "@/lib/server/photos";
import { requireUser } from "@/lib/server/session";

export async function uploadPersonPhoto(personId: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image." };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await savePersonPhoto(user.id, personId, bytes);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
