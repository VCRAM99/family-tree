import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

const memory = new Map<string, unknown>();

export function publicTreeTag(treeId: string): string {
  return `public-tree:${treeId}`;
}

/** Sanitized public/unlisted tree, reused across requests until a write to that tree. */
export async function cachedPublicTree<T>(treeId: string, variant: string, load: () => Promise<T>): Promise<T> {
  const cacheKey = `${publicTreeTag(treeId)}:${variant}`;
  if (process.env.VITEST) {
    if (memory.has(cacheKey)) return memory.get(cacheKey) as T;
    const value = await load();
    memory.set(cacheKey, value);
    return value;
  }
  return unstable_cache(load, [cacheKey], { tags: [publicTreeTag(treeId)] })();
}

export function invalidatePublicTree(treeId: string): void {
  const tag = publicTreeTag(treeId);
  for (const key of memory.keys()) {
    if (key.startsWith(tag)) memory.delete(key);
  }
  if (process.env.VITEST) return;
  try {
    revalidateTag(tag, { expire: 0 });
  } catch {
    // Writes from scripts have no Next.js cache scope.
  }
}
