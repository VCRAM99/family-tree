"use server";

import { revalidatePath } from "next/cache";

import { actionError } from "@/lib/server/errors";
import { searchPublicTrees } from "@/lib/server/public-tree";
import { requireUser } from "@/lib/server/session";
import { createSuggestion } from "@/lib/server/suggestions";
import { classifyTreeLookup } from "@/lib/public-tag";
import { getPublicTreeByTag, getTreeByCode } from "@/lib/server/public-tree";
import { headers } from "next/headers";

async function clientIp() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "local";
}

export async function resolveTreeLookup(value: string): Promise<{ href?: string; error?: string }> {
  const kind = classifyTreeLookup(value);
  const ip = await clientIp();
  if (kind === "share_code") {
    const view = await getTreeByCode(value, ip);
    if (!view) return { error: "We couldn't find that tree." };
    return { href: `/v/${value.trim().toUpperCase()}` };
  }
  if (kind === "public_tag") {
    const view = await getPublicTreeByTag(value, ip);
    if (!view) return { error: "We couldn't find that tree." };
    return { href: `/t/${view.summary.publicTag}` };
  }
  return { error: "Enter an 8-character share code or a public tag." };
}

export async function searchPublicTreesAction(query: string): Promise<{ name: string; publicTag: string }[]> {
  return searchPublicTrees(query, await clientIp());
}

export async function suggestAction(
  treeId: string,
  input: {
    type: "new_person" | "contact_update" | "correction";
    targetPersonId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await createSuggestion(user.id, treeId, input);
    revalidatePath(`/tree/${treeId}/suggestions`);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}
