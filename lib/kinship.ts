import type { GraphPerson, ParentKind, Sex, TreeGraph, UnionStatus } from "@/lib/family-graph";

export type KinshipSide = "paternal" | "maternal";

export type KinshipRelationship = {
  term: string;
  side?: KinshipSide;
  pathDescription: string;
  via: string[];
};

const MAX_GENERATIONS = 15;
const MAX_PATHS = 32;

type Indexed = {
  people: Map<string, GraphPerson>;
  parents: Map<string, { id: string; kind: ParentKind }[]>;
  children: Map<string, string[]>;
  spouses: Map<string, { id: string; status: UnionStatus }[]>;
};

type BloodHit = {
  term: string;
  side?: KinshipSide;
  pathDescription: string;
  via: string[];
  distance: number;
  priority: number;
};

export function relationshipsBetween(graph: TreeGraph, meId: string, targetId: string): KinshipRelationship[] {
  const index = indexGraph(graph);
  const me = index.people.get(meId);
  const targetPerson = index.people.get(targetId);
  if (!me || !targetPerson) return [none()];
  if (me.isPlaceholder || targetPerson.isPlaceholder) return [];
  if (meId === targetId) return [];

  const blood = bloodRelationships(index, meId, targetId);
  const married = marriageRelationships(index, meId, targetId);
  const combined = dedupe([...blood, ...married]);
  if (combined.length > 0) return combined.map(strip);

  const via = connect(index, meId, targetId);
  if (via) {
    return [{ term: "Related by marriage", pathDescription: "Related by marriage", via }];
  }
  return [none()];
}

export function kinshipLabel(relationship: KinshipRelationship): string {
  return relationship.side ? `${relationship.side} ${relationship.term}` : relationship.term;
}

function none(): KinshipRelationship {
  return { term: "No known relation", pathDescription: "No known relation", via: [] };
}

function strip(hit: BloodHit): KinshipRelationship {
  return {
    term: hit.term,
    side: hit.side,
    pathDescription: hit.pathDescription,
    via: hit.via,
  };
}

function dedupe(hits: BloodHit[]): BloodHit[] {
  const sorted = [...hits].sort((a, b) => a.distance - b.distance || a.priority - b.priority || a.term.localeCompare(b.term));
  const seen = new Set<string>();
  const kept: BloodHit[] = [];
  for (const hit of sorted) {
    if (seen.has(hit.term)) continue;
    seen.add(hit.term);
    kept.push(hit);
  }
  return kept;
}

function indexGraph(graph: TreeGraph): Indexed {
  const people = new Map(graph.persons.map((person) => [person.id, person]));
  const parents = new Map<string, { id: string; kind: ParentKind }[]>();
  const children = new Map<string, string[]>();
  for (const link of graph.parentLinks) {
    const list = parents.get(link.childId);
    const edge = { id: link.parentId, kind: link.kind };
    if (list) list.push(edge);
    else parents.set(link.childId, [edge]);
    const kids = children.get(link.parentId);
    if (kids) kids.push(link.childId);
    else children.set(link.parentId, [link.childId]);
  }
  const spouses = new Map<string, { id: string; status: UnionStatus }[]>();
  for (const union of graph.unions) {
    addSpouse(spouses, union.personAId, union.personBId, union.status);
    addSpouse(spouses, union.personBId, union.personAId, union.status);
  }
  return { people, parents, children, spouses };
}

function addSpouse(map: Map<string, { id: string; status: UnionStatus }[]>, personId: string, spouseId: string, status: UnionStatus) {
  const list = map.get(personId);
  if (list) list.push({ id: spouseId, status });
  else map.set(personId, [{ id: spouseId, status }]);
}

function ancestorChains(index: Indexed, startId: string): Map<string, string[][]> {
  const chains = new Map<string, string[][]>();
  chains.set(startId, [[startId]]);
  const stack: string[][] = [[startId]];
  while (stack.length > 0) {
    const chain = stack.pop();
    if (!chain) continue;
    const generations = chain.length - 1;
    if (generations >= MAX_GENERATIONS) continue;
    const current = chain[chain.length - 1];
    if (!current) continue;
    for (const parent of index.parents.get(current) ?? []) {
      if (chain.includes(parent.id)) continue;
      const existing = chains.get(parent.id);
      if (existing && existing.length >= MAX_PATHS) continue;
      const next = [...chain, parent.id];
      if (existing) existing.push(next);
      else chains.set(parent.id, [next]);
      stack.push(next);
    }
  }
  return chains;
}

function bloodRelationships(index: Indexed, meId: string, targetId: string): BloodHit[] {
  const mine = ancestorChains(index, meId);
  const theirs = ancestorChains(index, targetId);
  const common = new Set<string>();
  for (const id of mine.keys()) {
    if (theirs.has(id)) common.add(id);
  }
  const target = index.people.get(targetId);
  if (!target) return [];
  const halfSibling = sharedParentCount(index, meId, targetId) === 1;
  const hits: BloodHit[] = [];

  for (const ancestorId of common) {
    const meChains = mine.get(ancestorId) ?? [];
    const targetChains = theirs.get(ancestorId) ?? [];
    for (const meChain of meChains) {
      for (const targetChain of targetChains) {
        if (shadowed(meChain, targetChain, ancestorId, common)) continue;
        const m = meChain.length - 1;
        const t = targetChain.length - 1;
        const kind = linkKind(index, meId, targetId, meChain, targetChain, m, t);
        const rawHalf = (m === 1 && t === 1 && halfSibling) || (m >= 2 && t >= 2 && !isCouple(index, meChain, targetChain, common));
        const half = kind === "biological" && rawHalf;
        const firstParentId = meChain[1];
        const firstParent = firstParentId ? index.people.get(firstParentId) : undefined;
        const described = describe(m, t, target.sex, half, kind, firstParent?.sex);
        if (!described) continue;
        const down = targetChain.slice(0, -1).reverse();
        hits.push({
          term: described.term,
          side: described.side,
          pathDescription: described.pathDescription,
          via: [...meChain, ...down],
          distance: m + t,
          priority: 0,
        });
      }
    }
  }
  return hits;
}

function shadowed(meChain: string[], targetChain: string[], ancestorId: string, common: Set<string>): boolean {
  const meSet = new Set(meChain);
  const targetSet = new Set(targetChain);
  for (const other of common) {
    if (other === ancestorId) continue;
    if (meSet.has(other) && targetSet.has(other)) return true;
  }
  return false;
}

function isCouple(index: Indexed, meChain: string[], targetChain: string[], common: Set<string>): boolean {
  const belowMe = meChain[meChain.length - 2];
  const belowTarget = targetChain[targetChain.length - 2];
  if (!belowMe || !belowTarget) return false;
  const mine = new Set((index.parents.get(belowMe) ?? []).map((parent) => parent.id));
  for (const parent of index.parents.get(belowTarget) ?? []) {
    if (mine.has(parent.id) && common.has(parent.id) && parent.id !== meChain[meChain.length - 1]) return true;
  }
  return false;
}

function sharedParentCount(index: Indexed, a: string, b: string): number {
  const real = (id: string) => !index.people.get(id)?.isPlaceholder;
  const mine = new Set((index.parents.get(a) ?? []).map((parent) => parent.id).filter(real));
  let count = 0;
  for (const parent of index.parents.get(b) ?? []) {
    if (mine.has(parent.id)) count += 1;
  }
  return count;
}

function linkKind(index: Indexed, meId: string, targetId: string, meChain: string[], targetChain: string[], m: number, t: number): ParentKind {
  if (m === 0 && t >= 1) {
    const childId = targetChain[targetChain.length - 2];
    return kindBetween(index, meId, childId) ?? "biological";
  }
  if (m === 1 && t === 1) {
    const parentId = meChain[1];
    const mine = parentId ? kindBetween(index, parentId, meId) : undefined;
    const theirs = parentId ? kindBetween(index, parentId, targetId) : undefined;
    return preferKind(mine, theirs);
  }
  const parentId = meChain[1];
  if (!parentId) return "biological";
  return kindBetween(index, parentId, meId) ?? "biological";
}

function kindBetween(index: Indexed, parentId: string, childId: string): ParentKind | undefined {
  return index.parents.get(childId)?.find((parent) => parent.id === parentId)?.kind;
}

function preferKind(a: ParentKind | undefined, b: ParentKind | undefined): ParentKind {
  const rank: Record<ParentKind, number> = { step: 0, adoptive: 1, foster: 2, biological: 3 };
  const left = a ?? "biological";
  const right = b ?? "biological";
  return rank[left] <= rank[right] ? left : right;
}

function describe(
  m: number,
  t: number,
  sex: Sex,
  half: boolean,
  kind: ParentKind,
  firstParentSex: Sex | undefined,
): { term: string; side?: KinshipSide; pathDescription: string } | null {
  if (m === 0 && t === 0) return null;
  const side = sideFor(m, t, firstParentSex);
  const term = withKind(kind, baseTerm(m, t, sex, half));
  if (m >= 2 && t > 0 && firstParentSex) {
    const parentHalf = half && m - 1 >= 2 && t >= 2;
    const lifted = baseTerm(m - 1, t, sex, parentHalf);
    const noun = withKind(kind, parentNoun(firstParentSex));
    return { term, side, pathDescription: `${noun}'s ${lifted}` };
  }
  const sideText = side ? `${side} ` : "";
  return { term, side, pathDescription: `your ${sideText}${term}` };
}

function sideFor(m: number, t: number, sex: Sex | undefined): KinshipSide | undefined {
  const applies = (t === 0 && m >= 2) || (t === 1 && m >= 2) || (m >= 2 && t >= 2);
  if (!applies) return undefined;
  if (sex === "male") return "paternal";
  if (sex === "female") return "maternal";
  return undefined;
}

function baseTerm(m: number, t: number, sex: Sex, half: boolean): string {
  if (t === 0 && m > 0) return ancestorTerm(m, sex);
  if (m === 0 && t > 0) return descendantTerm(t, sex);
  if (m === 1 && t === 1) return half ? `half-${siblingNoun(sex)}` : siblingNoun(sex);
  if (m === 1 && t >= 2) return niblingTerm(t, sex);
  if (t === 1 && m >= 2) return piblingTerm(m, sex);
  if (m >= 2 && t >= 2) return cousinTerm(m, t, half);
  return "relative";
}

function ancestorTerm(generations: number, sex: Sex): string {
  const noun = sex === "male" ? "father" : sex === "female" ? "mother" : "parent";
  if (generations === 1) return noun;
  return `${greatPrefix(generations)}${noun}`;
}

function descendantTerm(generations: number, sex: Sex): string {
  const noun = sex === "male" ? "son" : sex === "female" ? "daughter" : "child";
  if (generations === 1) return noun;
  return `${greatPrefix(generations)}${noun}`;
}

function greatPrefix(generations: number): string {
  const greats = generations - 2;
  if (greats <= 0) return "grand";
  return `${"great-".repeat(greats)}grand`;
}

function siblingNoun(sex: Sex): string {
  if (sex === "male") return "brother";
  if (sex === "female") return "sister";
  return "sibling";
}

function parentNoun(sex: Sex): string {
  if (sex === "male") return "father";
  if (sex === "female") return "mother";
  return "parent";
}

function niblingTerm(t: number, sex: Sex): string {
  const noun = sex === "male" ? "nephew" : sex === "female" ? "niece" : null;
  if (!noun) {
    if (t === 2) return "sibling's child";
    if (t === 3) return "sibling's grandchild";
    return `sibling's ${"great-".repeat(t - 3)}grandchild`;
  }
  if (t === 2) return noun;
  if (t === 3) return `grand-${noun}`;
  return `${"great-".repeat(t - 3)}grand-${noun}`;
}

function piblingTerm(m: number, sex: Sex): string {
  const noun = sex === "male" ? "uncle" : sex === "female" ? "aunt" : null;
  if (!noun) {
    if (m === 2) return "parent's sibling";
    if (m === 3) return "grandparent's sibling";
    return `${"great-".repeat(m - 3)}grandparent's sibling`;
  }
  if (m === 2) return noun;
  if (m === 3) return `grand-${noun}`;
  return `${"great-".repeat(m - 3)}grand-${noun}`;
}

function cousinTerm(m: number, t: number, half: boolean): string {
  const degree = Math.min(m, t) - 1;
  const removed = Math.abs(m - t);
  const name = `${ordinal(degree)} cousin${removedPhrase(removed)}`;
  return half ? `half-${name}` : name;
}

function ordinal(degree: number): string {
  const words = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  return words[degree] ?? `${degree}th`;
}

function removedPhrase(removed: number): string {
  if (removed === 0) return "";
  if (removed === 1) return " once removed";
  if (removed === 2) return " twice removed";
  if (removed === 3) return " three times removed";
  return ` ${removed} times removed`;
}

function withKind(kind: ParentKind, term: string): string {
  if (kind === "biological") return term;
  if (kind === "step") {
    if (term.includes(" ") || term.startsWith("half-")) return `step ${term}`;
    return `step${term}`;
  }
  return `${kind} ${term}`;
}

function marriageRelationships(index: Indexed, meId: string, targetId: string): BloodHit[] {
  const target = index.people.get(targetId);
  if (!target) return [];
  const hits: BloodHit[] = [];
  const direct = (index.spouses.get(meId) ?? []).filter((spouse) => spouse.id === targetId);
  if (direct.length > 0) {
    const status = preferredStatus(direct.map((spouse) => spouse.status));
    const term = spouseTerm(target.sex, status);
    hits.push({
      term,
      pathDescription: `your ${term}`,
      via: [meId, targetId],
      distance: 1,
      priority: 2,
    });
  }

  const myParents = new Set((index.parents.get(meId) ?? []).map((parent) => parent.id));
  for (const parentId of myParents) {
    for (const spouse of index.spouses.get(parentId) ?? []) {
      if (spouse.id !== targetId || myParents.has(targetId)) continue;
      const term = stepParentTerm(target.sex);
      hits.push({
        term,
        pathDescription: `your ${term}`,
        via: [meId, parentId, targetId],
        distance: 2,
        priority: 1,
      });
    }
  }

  const myChildren = new Set(index.children.get(meId) ?? []);
  for (const spouse of index.spouses.get(meId) ?? []) {
    for (const childId of index.children.get(spouse.id) ?? []) {
      if (childId !== targetId || myChildren.has(targetId)) continue;
      const term = stepChildTerm(target.sex);
      hits.push({
        term,
        pathDescription: `your ${term}`,
        via: [meId, spouse.id, targetId],
        distance: 2,
        priority: 1,
      });
    }
  }

  for (const relative of index.spouses.get(targetId) ?? []) {
    if (relative.id === meId) continue;
    if (myParents.has(relative.id)) continue;
    const blood = dedupe(bloodRelationships(index, meId, relative.id));
    const closest = blood[0];
    if (!closest) continue;
    const term = spouseOfBloodTerm(closest, target.sex);
    if (!term) continue;
    hits.push({
      term,
      pathDescription: `your ${term}`,
      via: [meId, relative.id, targetId],
      distance: closest.distance + 1,
      priority: 3,
    });
  }

  for (const spouse of index.spouses.get(meId) ?? []) {
    const blood = dedupe(bloodRelationships(index, spouse.id, targetId));
    for (const hit of blood) {
      if (hit.distance === 1 && hit.term.match(/son|daughter|child/)) continue;
      const term = relativeOfSpouseTerm(hit, target.sex);
      if (!term) continue;
      hits.push({
        term,
        pathDescription: term.startsWith("spouse's") ? term : `your ${term}`,
        via: [meId, spouse.id, targetId],
        distance: hit.distance + 1,
        priority: 3,
      });
    }
  }

  return hits;
}

function preferredStatus(statuses: UnionStatus[]): UnionStatus {
  if (statuses.includes("married")) return "married";
  if (statuses.includes("partner")) return "partner";
  if (statuses.includes("widowed")) return "widowed";
  return "divorced";
}

function spouseTerm(sex: Sex, status: UnionStatus): string {
  if (status === "partner") return "partner";
  const noun = sex === "male" ? "husband" : sex === "female" ? "wife" : "spouse";
  if (status === "divorced") return `ex-${noun}`;
  return noun;
}

function stepParentTerm(sex: Sex): string {
  if (sex === "male") return "stepfather";
  if (sex === "female") return "stepmother";
  return "stepparent";
}

function stepChildTerm(sex: Sex): string {
  if (sex === "male") return "stepson";
  if (sex === "female") return "stepdaughter";
  return "stepchild";
}

function spouseOfBloodTerm(blood: BloodHit, sex: Sex): string | null {
  if (isPibling(blood.term)) return `${piblingFromSex(blood.term, sex)} by marriage`;
  if (isSiblingTerm(blood.term)) return inLaw("sibling", sex);
  if (isChildTerm(blood.term)) return inLaw(blood.term.includes("grand") ? "grandchild" : "child", sex);
  if (isParentTerm(blood.term)) return null;
  if (blood.term.includes("cousin")) return `${blood.term} by marriage`;
  if (blood.term.includes("nephew") || blood.term.includes("niece") || blood.term.includes("sibling's")) {
    return sex === "male" ? "nephew-in-law" : sex === "female" ? "niece-in-law" : "sibling's child-in-law";
  }
  return null;
}

function isPibling(term: string): boolean {
  return /uncle|aunt|parent's sibling|grandparent's sibling/.test(term);
}

function piblingFromSex(bloodTerm: string, sex: Sex): string {
  const distance = bloodTerm.startsWith("great-great-grand") ? 5 : bloodTerm.startsWith("great-grand") ? 4 : bloodTerm.startsWith("grand") ? 3 : 2;
  return piblingTerm(distance, sex);
}

function isSiblingTerm(term: string): boolean {
  return /^(?:adoptive |foster |step )?(?:half-)?(?:brother|sister|sibling)$/.test(term) || /^(?:half-)?step(?:brother|sister|sibling)$/.test(term);
}

function isChildTerm(term: string): boolean {
  return /^(?:adoptive |foster |step )?(?:great-)*(?:grand)?(?:son|daughter|child)$/.test(term) || /^step(?:son|daughter|child)$/.test(term);
}

function isParentTerm(term: string): boolean {
  return /^(?:adoptive |foster |step )?(?:great-)*(?:grand)?(?:father|mother|parent)$/.test(term) || /^step(?:father|mother|parent)$/.test(term);
}

function inLaw(kind: "sibling" | "child" | "grandchild" | "parent", sex: Sex): string {
  if (kind === "sibling") return sex === "male" ? "brother-in-law" : sex === "female" ? "sister-in-law" : "sibling-in-law";
  if (kind === "child") return sex === "male" ? "son-in-law" : sex === "female" ? "daughter-in-law" : "child-in-law";
  if (kind === "grandchild") return sex === "male" ? "grandson-in-law" : sex === "female" ? "granddaughter-in-law" : "grandchild-in-law";
  return sex === "male" ? "father-in-law" : sex === "female" ? "mother-in-law" : "parent-in-law";
}

function relativeOfSpouseTerm(blood: BloodHit, sex: Sex): string | null {
  if (isParentTerm(blood.term) && !blood.term.includes("grand")) return inLaw("parent", sex);
  if (isSiblingTerm(blood.term)) return inLaw("sibling", sex);
  if (isChildTerm(blood.term) && (blood.term === "son" || blood.term === "daughter" || blood.term === "child" || blood.term.startsWith("step"))) {
    return null;
  }
  if (blood.term.includes("cousin")) return `spouse's ${blood.term.replace(/^half-/, "")}`;
  if (isPibling(blood.term)) return `spouse's ${blood.term}`;
  if (blood.term.includes("nephew") || blood.term.includes("niece") || blood.term.includes("sibling's")) return `spouse's ${blood.term}`;
  if (isParentTerm(blood.term)) return `spouse's ${blood.term}`;
  if (isChildTerm(blood.term)) return `spouse's ${blood.term}`;
  return null;
}

function connect(index: Indexed, startId: string, goalId: string): string[] | null {
  const queue: { id: string; via: string[] }[] = [{ id: startId, via: [startId] }];
  const seen = new Set<string>([startId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.via.length > MAX_GENERATIONS) continue;
    const neighbors = [
      ...(index.parents.get(current.id) ?? []).map((parent) => parent.id),
      ...(index.children.get(current.id) ?? []),
      ...(index.spouses.get(current.id) ?? []).map((spouse) => spouse.id),
    ];
    for (const nextId of neighbors) {
      if (seen.has(nextId)) continue;
      const via = [...current.via, nextId];
      if (nextId === goalId) return via;
      seen.add(nextId);
      queue.push({ id: nextId, via });
    }
  }
  return null;
}
