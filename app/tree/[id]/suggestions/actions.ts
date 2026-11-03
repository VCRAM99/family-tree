"use server";

import { revalidatePath } from "next/cache";

import { actionError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";
import { approveSuggestion, rejectSuggestion } from "@/lib/server/suggestions";

export async function approveSuggestionAction(
  treeId: string,
  suggestionId: string,
  payload?: Record<string, unknown>,
): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await approveSuggestion(user.id, treeId, suggestionId, payload);
    revalidatePath(`/tree/${treeId}`);
    revalidatePath(`/tree/${treeId}/suggestions`);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function rejectSuggestionAction(treeId: string, suggestionId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await rejectSuggestion(user.id, treeId, suggestionId);
    revalidatePath(`/tree/${treeId}/suggestions`);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}
