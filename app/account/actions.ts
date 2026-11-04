"use server";

import { redirect } from "next/navigation";

import { changeDisplayName, changePassword, deleteAccount } from "@/lib/server/account";
import { actionError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

export async function changeNameAction(name: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    await changeDisplayName(name);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    await changePassword(currentPassword, newPassword);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function deleteAccountAction(confirmation: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    await deleteAccount(confirmation);
  } catch (error) {
    return { error: actionError(error) };
  }
  redirect("/");
}
