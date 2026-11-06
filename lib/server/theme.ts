import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { user } from "@/lib/db/schema";
import { isThemeId, type ThemeId } from "@/lib/themes";

import { getDb } from "./db";
import { getCurrentUser } from "./session";

export const THEME_COOKIE = "theme";

/**
 * Cookie first, then the signed-in account theme, then the system theme.
 * Saving a theme writes both, so this browser and the account stay together.
 */
export async function resolveDocumentTheme(): Promise<ThemeId> {
  try {
    const stored = (await cookies()).get(THEME_COOKIE)?.value;
    if (stored && isThemeId(stored)) return stored;
    const current = await getCurrentUser();
    if (current) {
      const [row] = await getDb().select({ theme: user.theme }).from(user).where(eq(user.id, current.id)).limit(1);
      if (row && isThemeId(row.theme)) return row.theme;
    }
  } catch {
    return "system";
  }
  return "system";
}
