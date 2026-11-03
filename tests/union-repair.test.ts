import { describe, expect, it } from "vitest";

import { childrenGrouped, createGraphIndex, effectiveUnionId, type GraphPerson, type TreeGraph } from "@/lib/family-graph";
import { childUnionChoice } from "@/lib/person-edits";
import { planUnionRepair } from "@/lib/union-repair";

function person(id: string): GraphPerson {
  return {
    id,
    treeId: "tree",
    firstName: id,
    middleName: null,
    lastName: null,
    preferredName: null,
    birthSurname: null,
    sex: "unknown",
    birthDate: null,
    birthDatePrecision: null,
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

describe("union repair", () => {
  it("plans a union when two parents have none, and backfills a null union id", () => {
    const plan = planUnionRepair(
      [
        { id: "l1", treeId: "t", parentId: "mom", childId: "kid", unionId: null },
        { id: "l2", treeId: "t", parentId: "dad", childId: "kid", unionId: null },
        { id: "l3", treeId: "t", parentId: "mom", childId: "other", unionId: null },
        { id: "l4", treeId: "t", parentId: "dad", childId: "other", unionId: null },
      ],
      [{ id: "u", treeId: "t", personAId: "dad", personBId: "mom" }],
    );
    expect(plan.create).toEqual([]);
    expect(plan.backfill).toEqual([
      { linkId: "l1", unionId: "u" },
      { linkId: "l2", unionId: "u" },
      { linkId: "l3", unionId: "u" },
      { linkId: "l4", unionId: "u" },
    ]);

    const missing = planUnionRepair(
      [
        { id: "a", treeId: "t", parentId: "mom", childId: "kid", unionId: null },
        { id: "b", treeId: "t", parentId: "dad", childId: "kid", unionId: null },
      ],
      [],
    );
    expect(missing.create).toEqual([{ treeId: "t", personAId: "dad", personBId: "mom", linkIds: ["a", "b"] }]);
    expect(missing.backfill).toEqual([]);
  });

  it("treats the parents' only union as the child's union when union_id is null", () => {
    const graph: TreeGraph = {
      persons: [person("mom"), person("dad"), person("kid")],
      parentLinks: [
        { id: "l1", parentId: "mom", childId: "kid", kind: "biological", unionId: null },
        { id: "l2", parentId: "dad", childId: "kid", kind: "biological", unionId: null },
      ],
      unions: [{ id: "u", personAId: "mom", personBId: "dad", status: "married", startDate: null, endDate: null, sortOrder: 0 }],
    };
    const index = createGraphIndex(graph);
    expect(effectiveUnionId(index, graph.parentLinks[0]!)).toBe("u");
    expect(childrenGrouped(index, "mom")[0]?.union?.id).toBe("u");
  });

  it("defaults a single spouse and asks when there are several", () => {
    expect(childUnionChoice([])).toEqual({ step: "choose", unionId: null });
    expect(childUnionChoice(["only"])).toEqual({ step: "choose", unionId: "only" });
    expect(childUnionChoice(["a", "b"])).toEqual({ step: "union", unionId: null });
  });
});
