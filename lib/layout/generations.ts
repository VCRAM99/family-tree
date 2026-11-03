import { createGraphIndex, spouses, type TreeGraph } from "@/lib/family-graph";

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
 * People with parents sit one generation below their latest parent.
 * People without parents sit one row above their earliest child, or on a
 * spouse's row when they have no children. Isolated people are generation 0.
 * The numbers repeat until they stop moving. Two people who both have parents
 * keep those rows, so an uncle married to his niece still crosses generations.
 */
export function assignGenerations(graph: TreeGraph): Map<string, number> {
  return assignVisibleGenerations(graphWithoutPlaceholders(graph));
}

function assignVisibleGenerations(graph: TreeGraph): Map<string, number> {
  const index = createGraphIndex(graph);
  const ids = graph.persons.map((person) => person.id).sort((a, b) => a.localeCompare(b));
  const generations = new Map<string, number>();
  for (const id of ids) generations.set(id, 0);

  const parentIds = new Map<string, string[]>();
  const childIds = new Map<string, string[]>();
  for (const link of graph.parentLinks) {
    const parents = parentIds.get(link.childId) ?? [];
    parents.push(link.parentId);
    parentIds.set(link.childId, parents);
    const children = childIds.get(link.parentId) ?? [];
    children.push(link.childId);
    childIds.set(link.parentId, children);
  }

  const limit = Math.max(1, ids.length * 2);
  for (let pass = 0; pass < limit; pass += 1) {
    let changed = false;
    for (const id of ids) {
      const parents = parentIds.get(id) ?? [];
      if (parents.length === 0) continue;
      const next = parents.reduce((max, parentId) => Math.max(max, generations.get(parentId) ?? 0), 0) + 1;
      if (generations.get(id) !== next) {
        generations.set(id, next);
        changed = true;
      }
    }
    for (const id of ids) {
      const parents = parentIds.get(id) ?? [];
      if (parents.length > 0) continue;
      const children = childIds.get(id) ?? [];
      let next = 0;
      if (children.length > 0) {
        next = children.reduce((min, childId) => Math.min(min, generations.get(childId) ?? 0), Number.POSITIVE_INFINITY) - 1;
      } else {
        const partner = spouses(index, id)[0]?.person.id;
        next = partner ? (generations.get(partner) ?? 0) : 0;
      }
      if (!Number.isFinite(next)) next = 0;
      if (generations.get(id) !== next) {
        generations.set(id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  let min = 0;
  for (const value of generations.values()) min = Math.min(min, value);
  if (min < 0) {
    for (const [id, value] of generations) generations.set(id, value - min);
  }
  return generations;
}
