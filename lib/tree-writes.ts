/** Client writes go through a route handler so a save does not re-render the tree page. */

export async function writeTree<T extends { error?: string }>(treeId: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/trees/${treeId}/writes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as T | null;
  if (!data) return { error: "Could not save." } as T;
  return data;
}
