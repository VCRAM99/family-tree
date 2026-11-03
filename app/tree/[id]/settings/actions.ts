"use server";

import { revalidatePath } from "next/cache";

import type { SettingsInput } from "@/lib/validation";
import { actionError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";
import { publicTagAvailability, regenerateShareCode, updateTreeSettings } from "@/lib/server/trees";

export async function saveSettingsAction(treeId: string, input: SettingsInput): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await updateTreeSettings(user.id, treeId, input);
    revalidatePath(`/tree/${treeId}/settings`);
    revalidatePath(`/tree/${treeId}`);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function regenerateShareCodeAction(treeId: string): Promise<{ error?: string; shareCode?: string }> {
  const user = await requireUser();
  try {
    const shareCode = await regenerateShareCode(user.id, treeId);
    revalidatePath(`/tree/${treeId}/settings`);
    return { shareCode: shareCode.trim() };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function checkPublicTagAction(
  treeId: string,
  tag: string,
): Promise<{ valid: boolean; available: boolean; message: string } | { error: string }> {
  const user = await requireUser();
  try {
    return await publicTagAvailability(user.id, treeId, tag);
  } catch (error) {
    return { error: actionError(error) };
  }
}
