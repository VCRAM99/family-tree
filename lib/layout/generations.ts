import { createGraphIndex, type TreeGraph } from "@/lib/family-graph";

/** Placeholders are junctions, not a generation of people. */
export function graphWithoutPlaceholders(graph: TreeGraph): TreeGraph {
  const hidden = new Set(graph.persons.filter((person) => person.isPlaceholder).map((person) => person.id));
  if (hidden.size === 0) return graph;
  return {
    persons: graph.persons.filter((person) => !hidden.has(person.id)),
    parentLinks: graph.parentLinks.filter((link) => !hidden.has(link.parentId) && !hidden.has(link.childId)),
    unions: graph.unions.filter((union) => !hidden.has(union.personAId) && !hidden.has(union.personBId)),
  };
}

/**
 * Spouses share a row unless one is an ancestor of the other.
 * Each safe couple is one unit. A unit's generation is the longest path of
 * parent→child edges between units, so a cousin with deeper ancestry pulls
 * both spouses down to that row. An ancestor/descendant marriage is not merged;
 * that pair can sit on different rows and the spouse line crosses them.
 */
export function assignGenerations(graph: TreeGraph): Map<string, number> {
  return assignVisibleGenerations(graphWithoutPlaceholders(graph));
}

function assignVisibleGenerations(graph: TreeGraph): Map<string, number> {
  const index = createGraphIndex(graph);
  const ids = graph.persons.map((person) => person.id).sort((a, b) => a.localeCompare(b));
  const parentIds = new Map<string, string[]>();
  for (const link of graph.parentLinks) {
    if (!index.personById.has(link.parentId) || !index.personById.has(link.childId)) continue;
    const parents = parentIds.get(link.childId) ?? [];
    parents.push(link.parentId);
    parentIds.set(link.childId, parents);
  }

  const ancestorCache = new Map<string, Set<string>>();
  function ancestors(id: string): Set<string> {
    const cached = ancestorCache.get(id);
    if (cached) return cached;
    const set = new Set<string>();
    ancestorCache.set(id, set);
    for (const parentId of parentIds.get(id) ?? []) {
      set.add(parentId);
      for (const older of ancestors(parentId)) set.add(older);
    }
    return set;
  }
  for (const id of ids) ancestors(id);

  const parent = new Map<string, string>();
  function find(id: string): string {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root) ?? root;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }
  function unite(left: string, right: string) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  }

  for (const union of graph.unions) {
    if (!index.personById.has(union.personAId) || !index.personById.has(union.personBId)) continue;
    const aIsAncestor = ancestors(union.personBId).has(union.personAId);
    const bIsAncestor = ancestors(union.personAId).has(union.personBId);
    if (aIsAncestor || bIsAncestor) continue;
    unite(union.personAId, union.personBId);
  }

  const outgoing = new Map<string, Set<string>>();
  const seenEdges = new Set<string>();
  function addEdge(fromId: string, toId: string) {
    const from = find(fromId);
    const to = find(toId);
    if (from === to) return;
    const key = `${from}>${to}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    const list = outgoing.get(from) ?? new Set<string>();
    list.add(to);
    outgoing.set(from, list);
  }
  for (const link of graph.parentLinks) {
    if (!index.personById.has(link.parentId) || !index.personById.has(link.childId)) continue;
    addEdge(link.parentId, link.childId);
  }

  const units = [...new Set(ids.map((id) => find(id)))].sort((a, b) => a.localeCompare(b));
  const unitGeneration = new Map<string, number>();
  for (const unit of units) unitGeneration.set(unit, 0);
  for (let pass = 0; pass < units.length; pass += 1) {
    let changed = false;
    for (const unit of units) {
      for (const next of outgoing.get(unit) ?? []) {
        const candidate = (unitGeneration.get(unit) ?? 0) + 1;
        if ((unitGeneration.get(next) ?? 0) < candidate) {
          unitGeneration.set(next, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const generations = new Map<string, number>();
  for (const id of ids) generations.set(id, unitGeneration.get(find(id)) ?? 0);
  return generations;
}
