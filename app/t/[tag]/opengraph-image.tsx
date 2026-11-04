import { and, eq, sql } from "drizzle-orm";

import { ogCard, ogContentType, ogSize } from "@/components/og-card";
import { persons, trees } from "@/lib/db/schema";
import { getDb } from "@/lib/server/db";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "A public family tree";

export default async function PublicTreeImage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const normalized = tag.trim().toLowerCase();
  const [tree] = await getDb()
    .select({ id: trees.id, name: trees.name })
    .from(trees)
    .where(and(eq(trees.visibility, "public"), sql`lower(${trees.publicTag}) = ${normalized}`))
    .limit(1);
  if (!tree) return ogCard("Family Tree", "A private family archive");
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(persons)
    .where(and(eq(persons.treeId, tree.id), eq(persons.isPlaceholder, false)));
  const count = row?.count ?? 0;
  const detail = count === 1 ? "1 person" : `${count} people`;
  return ogCard(tree.name, detail);
}
