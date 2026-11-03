import { describe, expect, it } from "vitest";

import { createGraphIndex, type GraphPerson, type TreeGraph } from "@/lib/family-graph";
import { focusTargets } from "@/lib/focus-nav";

function person(id: string, sex: GraphPerson["sex"], birthDate: string | null): GraphPerson {
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

const family: TreeGraph = {
  persons: [
    person("dad", "male", "1950-01-01"),
    person("mom", "female", "1952-01-01"),
    person("older", "female", "1975-01-01"),
    person("me", "male", "1978-01-01"),
    person("younger", "male", "1981-01-01"),
    person("wife", "female", "1979-01-01"),
    person("kid-a", "female", "2005-01-01"),
    person("kid-b", "male", "2008-01-01"),
    person("only", "unknown", "1990-01-01"),
  ],
  parentLinks: [
    { id: "1", parentId: "dad", childId: "older", kind: "biological", unionId: "u1" },
    { id: "2", parentId: "mom", childId: "older", kind: "biological", unionId: "u1" },
    { id: "3", parentId: "dad", childId: "me", kind: "biological", unionId: "u1" },
    { id: "4", parentId: "mom", childId: "me", kind: "biological", unionId: "u1" },
    { id: "5", parentId: "dad", childId: "younger", kind: "biological", unionId: "u1" },
    { id: "6", parentId: "mom", childId: "younger", kind: "biological", unionId: "u1" },
    { id: "7", parentId: "me", childId: "kid-a", kind: "biological", unionId: "u2" },
    { id: "8", parentId: "wife", childId: "kid-a", kind: "biological", unionId: "u2" },
    { id: "9", parentId: "me", childId: "kid-b", kind: "biological", unionId: null },
  ],
  unions: [
    { id: "u1", personAId: "dad", personBId: "mom", status: "married", startDate: null, endDate: null, sortOrder: 0 },
    { id: "u2", personAId: "me", personBId: "wife", status: "married", startDate: null, endDate: null, sortOrder: 0 },
  ],
};

describe("focus navigation", () => {
  it("orders siblings by birth and groups children by union", () => {
    const targets = focusTargets(createGraphIndex(family), "me");
    expect(targets.father?.id).toBe("dad");
    expect(targets.mother?.id).toBe("mom");
    expect(targets.previousSibling?.id).toBe("older");
    expect(targets.nextSibling?.id).toBe("younger");
    expect(targets.spouses.map((entry) => entry.person.id)).toEqual(["wife"]);
    expect(targets.childGroups.map((group) => group.children.map((child) => child.id))).toEqual([["kid-a"], ["kid-b"]]);
    expect(targets.childGroups[1]?.union).toBeNull();
  });

  it("reports missing relatives", () => {
    const targets = focusTargets(createGraphIndex(family), "only");
    expect(targets.missing).toEqual({ father: true, mother: true, spouse: true, child: true, sibling: true });
    expect(targets.previousSibling).toBeNull();
    expect(targets.nextSibling).toBeNull();
    expect(targets.childGroups).toEqual([]);
  });

  it("gives a grandmother with an unknown-sex spouse child and spouse arrows and no parent arrows", () => {
    const graph: TreeGraph = {
      persons: [person("gran", "female", "1940-01-01"), person("partner", "unknown", "1942-01-01"), person("child", "male", "1965-01-01")],
      parentLinks: [
        { id: "a", parentId: "gran", childId: "child", kind: "biological", unionId: "u" },
        { id: "b", parentId: "partner", childId: "child", kind: "biological", unionId: "u" },
      ],
      unions: [{ id: "u", personAId: "gran", personBId: "partner", status: "married", startDate: null, endDate: null, sortOrder: 0 }],
    };
    const targets = focusTargets(createGraphIndex(graph), "gran");
    expect(targets.parentSlots).toEqual([null, null]);
    expect(targets.missing.father).toBe(true);
    expect(targets.missing.mother).toBe(true);
    expect(targets.missing.spouse).toBe(false);
    expect(targets.missing.child).toBe(false);
    expect(targets.spouses.map((entry) => entry.person.id)).toEqual(["partner"]);
    expect(targets.childGroups.flatMap((group) => group.children.map((child) => child.id))).toEqual(["child"]);
  });

  it("puts an unknown-sex parent in an open parent slot", () => {
    const graph: TreeGraph = {
      persons: [person("child", "female", "2000-01-01"), person("parent", "unknown", "1970-01-01")],
      parentLinks: [{ id: "a", parentId: "parent", childId: "child", kind: "biological", unionId: null }],
      unions: [],
    };
    const targets = focusTargets(createGraphIndex(graph), "child");
    expect(targets.parentSlots[0]).toMatchObject({ role: "parent", person: { id: "parent" } });
    expect(targets.parentSlots[1]).toBeNull();
    expect(targets.missing.father).toBe(false);
    expect(targets.missing.mother).toBe(true);
  });
});
