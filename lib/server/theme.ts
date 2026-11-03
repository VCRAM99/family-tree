import "server-only";

import { headers } from "next/headers";

import { isThemeId, type ThemeId } from "@/lib/themes";

import { getTreeRole } from "./authz";
import { getCurrentUser } from "./session";
import { getTreeTheme } from "./trees";

export async function resolveDocumentTheme(): Promise<ThemeId> {
  try {
    const headerStore = await headers();
    const pathname = headerStore.get("x-pathname") ?? "";
    const match = pathname.match(/^\/tree\/([0-9a-f-]{36})(?:\/|$)/i);
    const treeId = match?.[1];
    if (!treeId) return "system";
    const user = await getCurrentUser();
    if (!user) return "system";
    const role = await getTreeRole(user.id, treeId);
    if (!role) return "system";
    const theme = await getTreeTheme(treeId);
    return isThemeId(theme) ? theme : "system";
  } catch {
    return "system";
  }
}
