import type { TreeGraph } from "@/lib/family-graph";

/** Structural hash. Names and bios do not move nodes; birth dates do, because siblings are ordered by them. */
export function layoutHash(graph: TreeGraph): string {
  const people = graph.persons
    .map((person) => [person.id, person.birthDate ?? "", person.sex, person.isPlaceholder ? "1" : "0"])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const links = graph.parentLinks
    .map((link) => [link.parentId, link.childId, link.unionId ?? "", link.kind])
    .sort((a, b) => a.join("|").localeCompare(b.join("|")));
  const unions = graph.unions
    .map((union) => [union.id, union.personAId, union.personBId, String(union.sortOrder), union.status])
    .sort((a, b) => a.join("|").localeCompare(b.join("|")));
  return hashString(JSON.stringify({ people, links, unions }));
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
