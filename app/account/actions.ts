"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { user } from "@/lib/db/schema";
import { changeDisplayName, changePassword, deleteAccount } from "@/lib/server/account";
import { getDb } from "@/lib/server/db";
import { actionError } from "@/lib/server/errors";
import { getCurrentUser, requireUser } from "@/lib/server/session";
import { THEME_COOKIE } from "@/lib/server/theme";
import { isThemeId } from "@/lib/themes";

export async function saveThemeAction(theme: string): Promise<{ error?: string }> {
  if (!isThemeId(theme)) return { error: "Unknown theme." };
  const jar = await cookies();
  jar.set(THEME_COOKIE, theme, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400,
    secure: process.env.NODE_ENV === "production",
  });
  const current = await getCurrentUser();
  if (current) {
    await getDb().update(user).set({ theme }).where(eq(user.id, current.id));
  }
  return {};
}

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
