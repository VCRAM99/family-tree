"use server";

import { redirect } from "next/navigation";

import { revalidatePath } from "next/cache";

import { actionError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";
import { createTree, deleteTree, renameTree } from "@/lib/server/trees";

export async function createTreeAction(formData: FormData): Promise<{ error: string } | void> {
  const user = await requireUser();
  let treeId = "";
  try {
    const tree = await createTree(user.id, user.email, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
    treeId = tree.id;
  } catch (error) {
    return { error: actionError(error) };
  }
  redirect(`/tree/${treeId}`);
}

export async function renameTreeAction(treeId: string, name: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await renameTree(user.id, treeId, name);
    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function deleteTreeAction(treeId: string, confirmationName: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await deleteTree(user.id, treeId, confirmationName);
    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}
