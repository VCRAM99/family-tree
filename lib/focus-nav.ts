import {
  childrenGrouped,
  orderingYear,
  parents,
  siblings,
  spouses,
  type ChildGroup,
  type GraphIndex,
  type GraphPerson,
  type SpouseRef,
} from "@/lib/family-graph";

export type ParentSlot = {
  person: GraphPerson;
  role: "father" | "mother" | "parent";
};

export type FocusTargets = {
  father: GraphPerson | null;
  mother: GraphPerson | null;
  /** Left is father, right is mother. Unknown sex fills the empty side and is labeled Parent. */
  parentSlots: [ParentSlot | null, ParentSlot | null];
  otherParents: GraphPerson[];
  spouses: SpouseRef[];
  previousSibling: GraphPerson | null;
  nextSibling: GraphPerson | null;
  childGroups: ChildGroup[];
  missing: {
    father: boolean;
    mother: boolean;
    spouse: boolean;
    child: boolean;
    sibling: boolean;
  };
};

export function focusTargets(index: GraphIndex, personId: string): FocusTargets {
  const parentPeople = parents(index, personId);
  const father = parentPeople.find((person) => person.sex === "male") ?? null;
  const mother = parentPeople.find((person) => person.sex === "female") ?? null;
  const slots: (ParentSlot | null)[] = [null, null];
  if (father) slots[0] = { person: father, role: "father" };
  if (mother) slots[1] = { person: mother, role: "mother" };
  const otherParents: GraphPerson[] = [];
  for (const person of parentPeople) {
    if (person === father || person === mother) continue;
    if (!slots[0]) slots[0] = { person, role: "parent" };
    else if (!slots[1]) slots[1] = { person, role: "parent" };
    else otherParents.push(person);
  }
  const parentSlots: [ParentSlot | null, ParentSlot | null] = [slots[0] ?? null, slots[1] ?? null];
  const partnerList = spouses(index, personId);
  const ordered = siblings(index, personId).map((entry) => entry.person);
  const self = index.personById.get(personId);
  const withSelf = self ? [...ordered, self].sort((a, b) => byBirth(index, a, b)) : ordered;
  const selfIndex = withSelf.findIndex((person) => person.id === personId);
  const childGroups = childrenGrouped(index, personId);
  return {
    father,
    mother,
    parentSlots,
    otherParents,
    spouses: partnerList,
    previousSibling: selfIndex > 0 ? withSelf[selfIndex - 1] ?? null : null,
    nextSibling: selfIndex >= 0 && selfIndex < withSelf.length - 1 ? withSelf[selfIndex + 1] ?? null : null,
    childGroups,
    missing: {
      father: !slots[0],
      mother: !slots[1],
      spouse: partnerList.length === 0,
      child: childGroups.every((group) => group.children.length === 0),
      sibling: ordered.length === 0,
    },
  };
}

function byBirth(index: GraphIndex, a: GraphPerson, b: GraphPerson): number {
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

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Arrow keys move between relatives. Enter is the only key that opens a card. */
export function arrowTarget(targets: FocusTargets, key: string, shift: boolean): string | null {
  if (key === "ArrowUp") {
    if (shift) return targets.mother?.id ?? targets.parentSlots[1]?.person.id ?? null;
    return targets.father?.id ?? targets.parentSlots[0]?.person.id ?? null;
  }
  if (key === "ArrowDown") {
    const children = targets.childGroups.flatMap((group) => group.children);
    return children.length === 1 ? children[0]?.id ?? null : null;
  }
  if (key === "ArrowLeft") return targets.previousSibling?.id ?? null;
  if (key === "ArrowRight") return targets.nextSibling?.id ?? null;
  return null;
}

export type ScreenBox = { x: number; y: number; width: number; height: number };
export type ScreenDirection = "up" | "down" | "left" | "right";

export function directionBetween(from: ScreenBox, to: ScreenBox): ScreenDirection {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy <= 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}
