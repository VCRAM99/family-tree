import { describe, expect, it } from "vitest";

import type { GraphPerson, ParentKind, Sex, TreeGraph, UnionStatus } from "@/lib/family-graph";
import { assignGenerations, clearLayoutCache, computeLayout, isJunctionId } from "@/lib/layout";

function person(id: string, sex: Sex = "unknown", birthDate: string | null = null): GraphPerson {
  return {
    id,
    treeId: "tree",
    firstName: id,
    middleName: null,
    lastName: null,
    preferredName: null,
    birthSurname: null,
    sex,
    birthDate,
    birthDatePrecision: birthDate ? "exact" : null,
    deathDate: null,
    deathDatePrecision: null,
    isDeceased: false,
    birthPlace: null,
    nativePlace: null,
    currentLocation: null,
    occupation: null,
    bio: null,
    hasPhoto: false,
    phoneWhatsapp: null,
    email: null,
    instagram: null,
    facebook: null,
    customFields: {},
  };
}

function graph(
  people: GraphPerson[],
  links: [string, string, string | null, ParentKind?][],
  unions: [string, string, string, number, UnionStatus?][],
): TreeGraph {
  return {
    persons: people,
    parentLinks: links.map(([parentId, childId, unionId, kind], index) => ({
      id: `l${index}`,
      parentId,
      childId,
      unionId,
      kind: kind ?? "biological",
    })),
    unions: unions.map(([id, personAId, personBId, sortOrder, status]) => ({
      id,
      personAId,
      personBId,
      sortOrder,
      status: status ?? "married",
      startDate: null,
      endDate: null,
    })),
  };
}

function center(layout: Awaited<ReturnType<typeof computeLayout>>, id: string): number {
  const point = layout.positions[id];
  if (!point) throw new Error(`missing ${id}`);
  return point.x + point.width / 2;
}

describe("layout", () => {
  it("keeps an uncle and his niece in different generations", () => {
    const family = graph(
      [
        person("gf", "male", "1900-01-01"),
        person("gm", "female", "1902-01-01"),
        person("uncle", "male", "1925-01-01"),
        person("mom", "female", "1928-01-01"),
        person("niece", "female", "1955-01-01"),
        person("baby", "male", "1980-01-01"),
      ],
      [
        ["gf", "uncle", "u-grandparents"],
        ["gm", "uncle", "u-grandparents"],
        ["gf", "mom", "u-grandparents"],
        ["gm", "mom", "u-grandparents"],
        ["mom", "niece", "u-mom"],
        ["dad", "niece", "u-mom"],
        ["uncle", "baby", "u-cross"],
        ["niece", "baby", "u-cross"],
      ],
      [
        ["u-grandparents", "gf", "gm", 0],
        ["u-mom", "dad", "mom", 0],
        ["u-cross", "uncle", "niece", 0],
      ],
    );
    family.persons.push(person("dad", "male", "1924-01-01"));
    const generations = assignGenerations(family);
    expect(generations.get("uncle")).toBe(1);
    expect(generations.get("niece")).toBe(2);
    expect(generations.get("baby")).toBe(3);
    expect(generations.get("niece")).not.toBe(generations.get("uncle"));
  });

  it("groups each spouse's children under that union and draws a collapsed person once", async () => {
    const family = graph(
      [
        person("me", "male", "1910-01-01"),
        person("a", "female", "1912-01-01"),
        person("b", "female", "1914-01-01"),
        person("child-a", "male", "1940-01-01"),
        person("child-b", "female", "1942-01-01"),
        person("shared", "male", "1880-01-01"),
      ],
      [
        ["me", "child-a", "ua"],
        ["a", "child-a", "ua"],
        ["me", "child-b", "ub"],
        ["b", "child-b", "ub"],
        ["shared", "me", null],
        ["shared", "a", null],
      ],
      [
        ["ua", "me", "a", 0],
        ["ub", "me", "b", 1],
      ],
    );
    clearLayoutCache();
    const layout = await computeLayout(family);
    const personIds = Object.keys(layout.positions).filter((id) => !isJunctionId(id));
    expect(new Set(personIds).size).toBe(personIds.length);
    expect(personIds.filter((id) => id === "shared")).toHaveLength(1);
    expect(layout.generations.me).toBe(1);
    expect(layout.generations["child-a"]).toBe(2);

    const childA = center(layout, "child-a");
    const childB = center(layout, "child-b");
    const midA = (center(layout, "me") + center(layout, "a")) / 2;
    const midB = (center(layout, "me") + center(layout, "b")) / 2;
    expect(Math.abs(childA - midA)).toBeLessThan(Math.abs(childA - midB));
    expect(Math.abs(childB - midB)).toBeLessThan(Math.abs(childB - midA));
    expect(layout.positions.a?.y).toBe(layout.positions.me?.y);
    expect(layout.positions.b?.y).toBe(layout.positions.me?.y);
    const couple = [layout.positions.a, layout.positions.me, layout.positions.b].filter((point) => point !== undefined).sort((a, b) => a.x - b.x);
    expect(couple[1]!.x - (couple[0]!.x + couple[0]!.width)).toBeLessThanOrEqual(28);
    expect(couple[2]!.x - (couple[1]!.x + couple[1]!.width)).toBeLessThanOrEqual(28);
    expect(Object.keys(layout.positions).some((id) => isJunctionId(id))).toBe(false);
    expect(layout.edges.some((edge) => isJunctionId(edge.source) || isJunctionId(edge.target))).toBe(false);
    expect(boxesOverlap(layout, personIds)).toBe(false);
  });

  it("puts a parentless spouse on the partner's row", async () => {
    const family = graph(
      [person("gf", "male", "1900-01-01"), person("gm", "female", "1902-01-01"), person("husband", "male", "1930-01-01"), person("wife", "unknown", null)],
      [
        ["gf", "husband", "g"],
        ["gm", "husband", "g"],
      ],
      [
        ["g", "gf", "gm", 0],
        ["m", "husband", "wife", 0],
      ],
    );
    const generations = assignGenerations(family);
    expect(generations.get("wife")).toBe(generations.get("husband"));
    clearLayoutCache();
    const layout = await computeLayout(family);
    expect(layout.positions.wife?.y).toBe(layout.positions.husband?.y);
    const left = layout.positions.husband!.x < layout.positions.wife!.x ? layout.positions.husband! : layout.positions.wife!;
    const right = left === layout.positions.husband ? layout.positions.wife! : layout.positions.husband!;
    expect(right.x - (left.x + left.width)).toBeLessThanOrEqual(28);
    expect(Object.keys(layout.positions).some((id) => isJunctionId(id))).toBe(false);
  });

  it("is deterministic for the same graph", async () => {
    const family = graph(
      [person("p", "female", "1930-05-01"), person("q", "male", "1928-05-01"), person("c", "female", "1955-05-01")],
      [
        ["p", "c", "u"],
        ["q", "c", "u"],
      ],
      [["u", "q", "p", 0]],
    );
    clearLayoutCache();
    const first = await computeLayout(family);
    clearLayoutCache();
    const second = await computeLayout(structuredClone(family));
    expect(second.positions).toEqual(first.positions);
    expect(second.generations).toEqual(first.generations);
  });

  it("arranges a 2,000-person tree", async () => {
    const family = wideFamily(2000);
    clearLayoutCache();
    const started = Date.now();
    const layout = await computeLayout(family);
    const elapsed = Date.now() - started;
    console.info(`layout 2000 people: ${elapsed}ms`);
    const people = Object.keys(layout.positions).filter((id) => !isJunctionId(id));
    expect(people).toHaveLength(2000);
    expect(boxesOverlap(layout, people)).toBe(false);
    expect(elapsed).toBeLessThan(2_000);
  }, 20_000);
});

function boxesOverlap(layout: Awaited<ReturnType<typeof computeLayout>>, ids: string[]): boolean {
  const boxes = ids.map((id) => layout.positions[id]).filter((box) => box !== undefined);
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (!a || !b) continue;
      const separated = a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5;
      if (!separated) return true;
    }
  }
  return false;
}

function wideFamily(count: number): TreeGraph {
  const persons: GraphPerson[] = [];
  const unions: TreeGraph["unions"] = [];
  const parentLinks: TreeGraph["parentLinks"] = [];
  const add = (sex: Sex, year: number) => {
    const id = `p${persons.length}`;
    persons.push(person(id, sex, `${year}-01-01`));
    return id;
  };
  let cohort = [add("male", 1800), add("female", 1801), add("male", 1802), add("female", 1803)];
  unions.push({ id: "u0", personAId: cohort[0]!, personBId: cohort[1]!, status: "married", startDate: null, endDate: null, sortOrder: 0 });
  unions.push({ id: "u1", personAId: cohort[2]!, personBId: cohort[3]!, status: "married", startDate: null, endDate: null, sortOrder: 0 });
  let year = 1825;
  let guard = 0;
  while (persons.length < count && cohort.length >= 2 && guard < 40) {
    guard += 1;
    const next: string[] = [];
    for (let index = 0; index + 1 < cohort.length && persons.length < count; index += 2) {
      const left = cohort[index];
      const right = cohort[index + 1];
      if (!left || !right) break;
      const unionId = unions.some((union) => (union.personAId === left && union.personBId === right) || (union.personAId === right && union.personBId === left))
        ? unions.find((union) => union.personAId === left || union.personBId === left)?.id ?? `u${unions.length}`
        : `u${unions.length}`;
      if (!unions.some((union) => union.id === unionId)) {
        unions.push({ id: unionId, personAId: left, personBId: right, status: "married", startDate: null, endDate: null, sortOrder: 0 });
      }
      for (let childIndex = 0; childIndex < 3 && persons.length < count; childIndex += 1) {
        const child = add(childIndex % 2 === 0 ? "female" : "male", year + childIndex);
        parentLinks.push({ id: `l${parentLinks.length}`, parentId: left, childId: child, unionId, kind: "biological" });
        parentLinks.push({ id: `l${parentLinks.length}`, parentId: right, childId: child, unionId, kind: "biological" });
        next.push(child);
      }
      if (persons.length < count && index % 6 === 0) {
        const extra = add("female", year + 4);
        const second = `u${unions.length}`;
        unions.push({ id: second, personAId: left, personBId: extra, status: "married", startDate: null, endDate: null, sortOrder: 1 });
        const child = add("male", year + 5);
        if (persons.length <= count) {
          parentLinks.push({ id: `l${parentLinks.length}`, parentId: left, childId: child, unionId: second, kind: "biological" });
          parentLinks.push({ id: `l${parentLinks.length}`, parentId: extra, childId: child, unionId: second, kind: "biological" });
          next.push(extra, child);
        }
      }
    }
    if (next.length >= 4 && persons.length < count) {
      const cousinA = next[0];
      const cousinB = next[3];
      if (cousinA && cousinB) {
        unions.push({ id: `u${unions.length}`, personAId: cousinA, personBId: cousinB, status: "married", startDate: null, endDate: null, sortOrder: 0 });
      }
    }
    cohort = next;
    year += 25;
  }
  const kept = new Set(persons.slice(0, count).map((item) => item.id));
  return {
    persons: persons.filter((item) => kept.has(item.id)),
    parentLinks: parentLinks.filter((link) => kept.has(link.parentId) && kept.has(link.childId)),
    unions: unions.filter((union) => kept.has(union.personAId) && kept.has(union.personBId)),
  };
}
