import "server-only";

import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { treeAdmins } from "@/lib/db/schema";

import { getDb, type AppDatabase } from "./db";
import { AuthzError } from "./errors";

type RoleQuery = Pick<AppDatabase, "select">;

export type TreeRole = "owner" | "admin";

export const getTreeRole = cache(async function getTreeRole(userId: string | null, treeId: string, db?: RoleQuery): Promise<TreeRole | null> {
  if (!userId) return null;
  const query = db ?? getDb();
  const [row] = await query
    .select({ role: treeAdmins.role, status: treeAdmins.status })
    .from(treeAdmins)
    .where(and(eq(treeAdmins.treeId, treeId), eq(treeAdmins.userId, userId)))
    .limit(1);

  if (!row || row.status !== "accepted") return null;
  if (row.role === "owner" || row.role === "admin") return row.role;
  return null;
});

export async function requireTreeAdmin(userId: string | null, treeId: string, db?: RoleQuery): Promise<TreeRole> {
  if (!userId) throw new AuthzError("Sign in to continue.", "unauthenticated");
  const role = await getTreeRole(userId, treeId, db);
  if (!role) throw new AuthzError("You do not have access to this tree.", "forbidden");
  return role;
}

export async function requireTreeOwner(userId: string | null, treeId: string): Promise<"owner"> {
  if (!userId) throw new AuthzError("Sign in to continue.", "unauthenticated");
  const role = await getTreeRole(userId, treeId);
  if (role !== "owner") throw new AuthzError("Only the owner can do that.", "forbidden");
  return role;
}
