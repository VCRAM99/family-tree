import { describe, expect, it } from "vitest";

import { childrenGrouped, createGraphIndex, siblings, spouses, type GraphPerson, type TreeGraph } from "@/lib/family-graph";
import { createTreeStore } from "@/lib/tree-store";

function person(id: string, birthDate: string | null = null): GraphPerson {
  return {
    id,
    treeId: "tree",
    firstName: id,
    middleName: null,
    lastName: null,
    preferredName: null,
    birthSurname: null,
    sex: "unknown",
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

function graph(): TreeGraph {
  return {
    persons: [person("dad"), person("mom"), person("me"), person("full", "1990-01-01"), person("half", "1992-01-01"), person("step"), person("kid-a", "2010-01-01"), person("kid-b", "2012-01-01"), person("kid-c")],
    parentLinks: [
      { id: "l1", parentId: "dad", childId: "me", kind: "biological", unionId: "u1" },
      { id: "l2", parentId: "mom", childId: "me", kind: "biological", unionId: "u1" },
      { id: "l3", parentId: "dad", childId: "full", kind: "biological", unionId: "u1" },
      { id: "l4", parentId: "mom", childId: "full", kind: "biological", unionId: "u1" },
      { id: "l5", parentId: "dad", childId: "half", kind: "biological", unionId: null },
      { id: "l6", parentId: "step", childId: "half", kind: "biological", unionId: "u2" },
      { id: "l7", parentId: "me", childId: "kid-a", kind: "biological", unionId: "u3" },
      { id: "l8", parentId: "step", childId: "kid-a", kind: "biological", unionId: "u3" },
      { id: "l9", parentId: "me", childId: "kid-b", kind: "biological", unionId: "u3" },
      { id: "l10", parentId: "me", childId: "kid-c", kind: "biological", unionId: null },
    ],
    unions: [
      { id: "u2", personAId: "dad", personBId: "step", status: "married", startDate: null, endDate: null, sortOrder: 1 },
      { id: "u1", personAId: "dad", personBId: "mom", status: "married", startDate: null, endDate: null, sortOrder: 0 },
      { id: "u3", personAId: "me", personBId: "step", status: "partner", startDate: null, endDate: null, sortOrder: 0 },
    ],
  };
}

describe("family graph selectors", () => {
  it("groups children by union and flags full and half siblings", () => {
    const index = createGraphIndex(graph());
    expect(siblings(index, "me").map((item) => [item.person.id, item.half])).toEqual([
      ["full", false],
      ["half", true],
    ]);
    const groups = childrenGrouped(index, "me");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.otherParent?.id).toBe("step");
    expect(groups[0]?.children.map((child) => child.id)).toEqual(["kid-a", "kid-b"]);
    expect(groups[1]?.union).toBeNull();
    expect(groups[1]?.children.map((child) => child.id)).toEqual(["kid-c"]);
  });

  it("orders spouses by union sort order and rolls back optimistic edits", () => {
    const store = createTreeStore(graph());
    expect(spouses(store.getState().index, "dad").map((item) => item.person.id)).toEqual(["mom", "step"]);
    const previous = store.getState().apply((draft) => {
      const first = draft.unions.find((union) => union.id === "u1");
      const second = draft.unions.find((union) => union.id === "u2");
      if (first) first.sortOrder = 5;
      if (second) second.sortOrder = 0;
    });
    expect(spouses(store.getState().index, "dad").map((item) => item.person.id)).toEqual(["step", "mom"]);
    store.getState().rollback(previous);
    expect(spouses(store.getState().index, "dad").map((item) => item.person.id)).toEqual(["mom", "step"]);
  });
});
