import type { CustomFieldValues } from "@/lib/domain";

export type Sex = "male" | "female" | "other" | "unknown";
export type DatePrecision = "exact" | "month" | "year" | "approx";
export type ParentKind = "biological" | "adoptive" | "step" | "foster";
export type UnionStatus = "married" | "divorced" | "widowed" | "partner";

export type GraphPerson = {
  id: string;
  treeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  preferredName: string | null;
  birthSurname: string | null;
  sex: Sex;
  birthDate: string | null;
  birthDatePrecision: DatePrecision | null;
  deathDate: string | null;
  deathDatePrecision: DatePrecision | null;
  isDeceased: boolean;
  birthPlace: string | null;
  nativePlace: string | null;
  currentLocation: string | null;
  occupation: string | null;
  bio: string | null;
  hasPhoto: boolean;
  /** Photo cache buster from person_photos.updated_at. Null when there is no photo. */
  photoVersion?: string | null;
  phoneWhatsapp: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  customFields: CustomFieldValues;
  /** Client-only. The row is not in the database until a first name is saved. */
  pending?: boolean;
  /** Client-only. Stable React key across the draft → saved id change. */
  clientKey?: string;
  /** Client-only. Previous ids that should still resolve to this person. */
  aliases?: string[];
  /** Hidden parent used so siblings can exist before a real parent is known. */
  isPlaceholder?: boolean;
  /** Public view: this living person is name-only. */
  livingOnly?: boolean;
};

export type GraphParentLink = {
  id: string;
  parentId: string;
  childId: string;
  kind: ParentKind;
  unionId: string | null;
};

export type GraphUnion = {
  id: string;
  personAId: string;
  personBId: string;
  status: UnionStatus;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
};

export type TreeGraph = {
  persons: GraphPerson[];
  parentLinks: GraphParentLink[];
  unions: GraphUnion[];
};

export type GraphIndex = {
  personById: Map<string, GraphPerson>;
  parentsOf: Map<string, GraphParentLink[]>;
  childrenOf: Map<string, GraphParentLink[]>;
  unionsOf: Map<string, GraphUnion[]>;
};

export type SpouseRef = {
  person: GraphPerson;
  union: GraphUnion;
};

export type SiblingRef = {
  person: GraphPerson;
  half: boolean;
};

export type ChildGroup = {
  union: GraphUnion | null;
  otherParent: GraphPerson | null;
  children: GraphPerson[];
};

const sexRank: Record<Sex, number> = { male: 0, female: 1, other: 2, unknown: 3 };

export function createGraphIndex(graph: TreeGraph): GraphIndex {
  const personById = new Map<string, GraphPerson>();
  for (const person of graph.persons) {
    personById.set(person.id, person);
    for (const alias of person.aliases ?? []) personById.set(alias, person);
  }
  const parentsOf = new Map<string, GraphParentLink[]>();
  const childrenOf = new Map<string, GraphParentLink[]>();
  for (const link of graph.parentLinks) {
    const parents = parentsOf.get(link.childId);
    if (parents) parents.push(link);
    else parentsOf.set(link.childId, [link]);
    const children = childrenOf.get(link.parentId);
    if (children) children.push(link);
    else childrenOf.set(link.parentId, [link]);
  }
  const unionsOf = new Map<string, GraphUnion[]>();
  for (const union of graph.unions) {
    for (const personId of [union.personAId, union.personBId]) {
      const list = unionsOf.get(personId);
      if (list) list.push(union);
      else unionsOf.set(personId, [union]);
    }
  }
  return { personById, parentsOf, childrenOf, unionsOf };
}

const orderingCache = new WeakMap<GraphIndex, Map<string, number | null>>();

/** Birth year for ordering only. Unknown dates are estimated and never stored. */
export function orderingYear(index: GraphIndex, id: string): number | null {
  let cache = orderingCache.get(index);
  if (!cache) {
    cache = new Map();
    orderingCache.set(index, cache);
  }
  return estimateYear(index, id, cache, new Set());
}

function estimateYear(index: GraphIndex, id: string, cache: Map<string, number | null>, stack: Set<string>): number | null {
  if (cache.has(id)) return cache.get(id) ?? null;
  const person = index.personById.get(id);
  if (!person) return null;
  if (person.birthDate) {
    const year = Number(person.birthDate.slice(0, 4));
    const value = Number.isFinite(year) ? year : null;
    cache.set(id, value);
    return value;
  }
  if (stack.has(id)) return null;
  stack.add(id);
  const fromParents = yearsOf(index, (index.parentsOf.get(id) ?? []).map((link) => link.parentId), cache, stack);
  if (fromParents.length > 0) {
    const value = Math.round(average(fromParents) + 25);
    cache.set(id, value);
    stack.delete(id);
    return value;
  }
  const fromChildren = yearsOf(index, (index.childrenOf.get(id) ?? []).map((link) => link.childId), cache, stack);
  if (fromChildren.length > 0) {
    const value = Math.round(average(fromChildren) - 25);
    cache.set(id, value);
    stack.delete(id);
    return value;
  }
  const spouseIds = (index.unionsOf.get(id) ?? []).map((union) => (union.personAId === id ? union.personBId : union.personAId));
  const fromSpouses = yearsOf(index, spouseIds, cache, stack);
  if (fromSpouses.length > 0) {
    const value = Math.round(average(fromSpouses));
    cache.set(id, value);
    stack.delete(id);
    return value;
  }
  cache.set(id, null);
  stack.delete(id);
  return null;
}

function yearsOf(index: GraphIndex, ids: string[], cache: Map<string, number | null>, stack: Set<string>): number[] {
  const years: number[] = [];
  for (const id of ids) {
    const year = estimateYear(index, id, cache, stack);
    if (year !== null) years.push(year);
  }
  return years;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function byBirthThenName(index: GraphIndex, a: GraphPerson, b: GraphPerson): number {
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) return a.birthDate < b.birthDate ? -1 : 1;
  if (!(a.birthDate && b.birthDate)) {
    const left = orderingYear(index, a.id);
    const right = orderingYear(index, b.id);
    if (left !== null && right !== null && left !== right) return left - right;
    if (left !== null && right === null) return -1;
    if (left === null && right !== null) return 1;
  }
  const name = a.firstName.localeCompare(b.firstName);
  if (name !== 0) return name;
  return a.id.localeCompare(b.id);
}

export function parents(index: GraphIndex, id: string): GraphPerson[] {
  const links = index.parentsOf.get(id) ?? [];
  const people = links.flatMap((link) => {
    const person = index.personById.get(link.parentId);
    return person && !person.isPlaceholder ? [person] : [];
  });
  return people.sort((a, b) => sexRank[a.sex] - sexRank[b.sex] || byBirthThenName(index, a, b));
}

export function spouses(index: GraphIndex, id: string): SpouseRef[] {
  const unions = index.unionsOf.get(id) ?? [];
  return unions
    .flatMap((union) => {
      const otherId = union.personAId === id ? union.personBId : union.personAId;
      const person = index.personById.get(otherId);
      return person ? [{ person, union }] : [];
    })
    .sort((a, b) => a.union.sortOrder - b.union.sortOrder || a.union.id.localeCompare(b.union.id));
}

export function childrenGrouped(index: GraphIndex, id: string): ChildGroup[] {
  const groups = new Map<string, GraphPerson[]>();
  const seen = new Map<string, Set<string>>();
  function addChild(key: string, child: GraphPerson) {
    const ids = seen.get(key) ?? new Set<string>();
    if (ids.has(child.id)) return;
    ids.add(child.id);
    seen.set(key, ids);
    const list = groups.get(key);
    if (list) list.push(child);
    else groups.set(key, [child]);
  }
  for (const link of index.childrenOf.get(id) ?? []) {
    const child = index.personById.get(link.childId);
    if (!child) continue;
    addChild(effectiveUnionId(index, link) ?? "", child);
  }
  for (const union of index.unionsOf.get(id) ?? []) {
    const otherId = union.personAId === id ? union.personBId : union.personAId;
    for (const link of index.childrenOf.get(otherId) ?? []) {
      const key = effectiveUnionId(index, link) ?? link.unionId ?? "";
      if (key !== union.id) continue;
      const child = index.personById.get(link.childId);
      if (!child) continue;
      addChild(union.id, child);
    }
  }

  const ordered: ChildGroup[] = [];
  const unionIds = [...groups.keys()].filter((key) => key !== "");
  unionIds.sort((a, b) => {
    const left = index.unionsOf.get(id)?.find((union) => union.id === a);
    const right = index.unionsOf.get(id)?.find((union) => union.id === b);
    return (left?.sortOrder ?? 0) - (right?.sortOrder ?? 0) || a.localeCompare(b);
  });

  for (const unionId of unionIds) {
    const union = (index.unionsOf.get(id) ?? []).find((item) => item.id === unionId) ?? null;
    const otherId = union ? (union.personAId === id ? union.personBId : union.personAId) : null;
    ordered.push({
      union,
      otherParent: otherId ? (index.personById.get(otherId) ?? null) : null,
      children: (groups.get(unionId) ?? []).sort((a, b) => byBirthThenName(index, a, b)),
    });
  }

  const unknown = groups.get("");
  if (unknown?.length) {
    ordered.push({ union: null, otherParent: null, children: unknown.sort((a, b) => byBirthThenName(index, a, b)) });
  }
  return ordered;
}

export function siblings(index: GraphIndex, id: string): SiblingRef[] {
  const myParents = new Set((index.parentsOf.get(id) ?? []).map((link) => link.parentId));
  const shared = new Map<string, Set<string>>();
  for (const parentId of myParents) {
    for (const link of index.childrenOf.get(parentId) ?? []) {
      if (link.childId === id) continue;
      const parents = shared.get(link.childId) ?? new Set<string>();
      parents.add(parentId);
      shared.set(link.childId, parents);
    }
  }
  const result: SiblingRef[] = [];
  for (const [personId, parents] of shared) {
    const person = index.personById.get(personId);
    if (!person || person.isPlaceholder) continue;
    const real = [...parents].filter((parentId) => !index.personById.get(parentId)?.isPlaceholder);
    result.push({ person, half: real.length === 1 });
  }
  return result.sort((a, b) => byBirthThenName(index, a.person, b.person));
}

export function relationshipCount(index: GraphIndex, id: string): number {
  const parents = (index.parentsOf.get(id) ?? []).filter((link) => !index.personById.get(link.parentId)?.isPlaceholder).length;
  const children = (index.childrenOf.get(id) ?? []).filter((link) => !index.personById.get(link.childId)?.isPlaceholder).length;
  const unions = (index.unionsOf.get(id) ?? []).filter((union) => {
    const otherId = union.personAId === id ? union.personBId : union.personAId;
    return !index.personById.get(otherId)?.isPlaceholder;
  }).length;
  return parents + children + unions;
}

/** Viewer identity, else the earliest birth date, else a stable person, else null when the tree is empty. */
export function defaultPersonId(graph: TreeGraph, viewerPersonId: string | null, requestedId: string | null): string | null {
  const people = graph.persons.filter((person) => !person.isPlaceholder && !person.pending);
  const ids = new Set(people.map((person) => person.id));
  if (requestedId && ids.has(requestedId)) return requestedId;
  if (viewerPersonId && ids.has(viewerPersonId)) return viewerPersonId;
  const dated = people.filter((person) => person.birthDate);
  if (dated.length > 0) {
    dated.sort((a, b) => a.birthDate!.localeCompare(b.birthDate!) || a.id.localeCompare(b.id));
    return dated[0]?.id ?? null;
  }
  if (people.length === 0) return null;
  return [...people].sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null;
}

/** When two parents share one union, a missing union_id still belongs to that union. */
export function effectiveUnionId(index: GraphIndex, link: GraphParentLink): string | null {
  if (link.unionId) return link.unionId;
  const parents = index.parentsOf.get(link.childId) ?? [];
  if (parents.length !== 2) return null;
  const pair = [parents[0]?.parentId, parents[1]?.parentId].filter((id): id is string => Boolean(id)).sort();
  if (pair.length !== 2) return null;
  const [left, right] = pair;
  const shared = (index.unionsOf.get(left ?? "") ?? []).filter((union) => {
    const ids = [union.personAId, union.personBId].sort();
    return ids[0] === left && ids[1] === right;
  });
  return shared.length === 1 ? shared[0]?.id ?? null : null;
}

export function formInstanceKey(person: Pick<GraphPerson, "id" | "clientKey">): string {
  return person.clientKey || person.id;
}

export function preferredDisplayName(person: Pick<GraphPerson, "preferredName" | "firstName">): string {
  const preferred = person.preferredName?.trim();
  if (preferred) return preferred;
  return person.firstName;
}

export function fullName(person: Pick<GraphPerson, "firstName" | "middleName" | "lastName">): string {
  return [person.firstName, person.middleName, person.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ");
}
