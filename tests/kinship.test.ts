import { describe, expect, it } from "vitest";

import type { GraphPerson, ParentKind, Sex, TreeGraph, UnionStatus } from "@/lib/family-graph";
import { relationshipsBetween } from "@/lib/kinship";

function person(id: string, sex: Sex = "unknown"): GraphPerson {
  return {
    id,
    treeId: "tree",
    firstName: id,
    middleName: null,
    lastName: null,
    preferredName: null,
    birthSurname: null,
    sex,
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

function build(
  specs: (string | [string, Sex])[],
  links: [string, string, ParentKind?][],
  unions: [string, string, UnionStatus?][] = [],
): TreeGraph {
  return {
    persons: specs.map((spec) => (Array.isArray(spec) ? person(spec[0], spec[1]) : person(spec))),
    parentLinks: links.map(([parentId, childId, kind], index) => ({
      id: `l${index}`,
      parentId,
      childId,
      kind: kind ?? "biological",
      unionId: null,
    })),
    unions: unions.map(([personAId, personBId, status], index) => ({
      id: `u${index}`,
      personAId,
      personBId,
      status: status ?? "married",
      startDate: null,
      endDate: null,
      sortOrder: index,
    })),
  };
}

function terms(graph: TreeGraph, me: string, target: string): string[] {
  return relationshipsBetween(graph, me, target).map((relationship) => relationship.term);
}

function closest(graph: TreeGraph, me: string, target: string) {
  const relationship = relationshipsBetween(graph, me, target)[0];
  if (!relationship) throw new Error("missing relationship");
  return relationship;
}

/** ids[0] is the parent of ids[1], and so on. */
function descend(ids: string[]): [string, string][] {
  const links: [string, string][] = [];
  for (let index = 0; index < ids.length - 1; index += 1) {
    const parent = ids[index];
    const child = ids[index + 1];
    if (parent && child) links.push([parent, child]);
  }
  return links;
}

describe("kinship", () => {
  it("names parent and child chains through great-great", () => {
    const up = ["gggf", "ggf", "gf", "f", "me"];
    const down = ["me2", "c", "gc", "ggc", "gggc"];
    const graph = build(
      [
        ["gggf", "male"],
        ["ggf", "male"],
        ["gf", "male"],
        ["f", "male"],
        ["me", "female"],
        ["me2", "female"],
        ["c", "male"],
        ["gc", "male"],
        ["ggc", "male"],
        ["gggc", "male"],
      ],
      [...descend(up), ...descend(down)],
    );

    expect(closest(graph, "me", "f")).toMatchObject({ term: "father", pathDescription: "your father" });
    expect(closest(graph, "me", "gf")).toMatchObject({
      term: "grandfather",
      side: "paternal",
      pathDescription: "your paternal grandfather",
    });
    expect(closest(graph, "me", "ggf").term).toBe("great-grandfather");
    expect(closest(graph, "me", "gggf").term).toBe("great-great-grandfather");
    expect(closest(graph, "me2", "c").term).toBe("son");
    expect(closest(graph, "me2", "gc").term).toBe("grandson");
    expect(closest(graph, "me2", "ggc").term).toBe("great-grandson");
    expect(closest(graph, "me2", "gggc").term).toBe("great-great-grandson");
    expect(closest(graph, "c", "me2").term).toBe("mother");
  });

  it("distinguishes full and half siblings", () => {
    const graph = build(
      [
        ["dad", "male"],
        ["mom", "female"],
        ["other", "female"],
        ["me", "male"],
        ["full", "female"],
        ["half", "male"],
      ],
      [
        ["dad", "me"],
        ["mom", "me"],
        ["dad", "full"],
        ["mom", "full"],
        ["dad", "half"],
        ["other", "half"],
      ],
    );
    expect(closest(graph, "me", "full").term).toBe("sister");
    expect(closest(graph, "me", "half").term).toBe("half-brother");
  });

  it("names nephews, nieces, and grand-nephews", () => {
    const graph = build(
      [
        ["dad", "male"],
        ["mom", "female"],
        ["me", "female"],
        ["brother", "male"],
        ["nephew", "male"],
        ["niece", "female"],
        ["grand", "male"],
      ],
      [
        ["dad", "me"],
        ["mom", "me"],
        ["dad", "brother"],
        ["mom", "brother"],
        ["brother", "nephew"],
        ["nephew", "grand"],
        ["brother", "niece"],
      ],
    );
    expect(closest(graph, "me", "nephew").term).toBe("nephew");
    expect(closest(graph, "me", "niece").term).toBe("niece");
    expect(closest(graph, "me", "grand").term).toBe("grand-nephew");
  });

  it("names uncles and grand-uncles, with paternal and maternal sides", () => {
    const graph = build(
      [
        ["pgf", "male"],
        ["pgm", "female"],
        ["mgf", "male"],
        ["mgm", "female"],
        ["dad", "male"],
        ["mom", "female"],
        ["pu", "male"],
        ["ma", "female"],
        ["ggf", "male"],
        ["gu", "male"],
        ["me", "female"],
      ],
      [
        ["pgf", "dad"],
        ["pgm", "dad"],
        ["mgf", "mom"],
        ["mgm", "mom"],
        ["dad", "me"],
        ["mom", "me"],
        ["pgf", "pu"],
        ["pgm", "pu"],
        ["mgf", "ma"],
        ["mgm", "ma"],
        ["ggf", "pgf"],
        ["ggf", "gu"],
      ],
    );
    expect(closest(graph, "me", "pu")).toMatchObject({
      term: "uncle",
      side: "paternal",
      pathDescription: "father's brother",
    });
    expect(closest(graph, "me", "ma")).toMatchObject({
      term: "aunt",
      side: "maternal",
      pathDescription: "mother's sister",
    });
    expect(closest(graph, "me", "gu").term).toBe("grand-uncle");
    expect(closest(graph, "me", "pgf")).toMatchObject({ term: "grandfather", side: "paternal" });
    expect(closest(graph, "me", "mgm")).toMatchObject({ term: "grandmother", side: "maternal" });
  });

  it("names cousins from first through third, with removals in both directions", () => {
    const clear = build(
      [
        ["s0a", "male"],
        ["s0b", "female"],
        ["p1", "male"],
        ["q1", "female"],
        ["p2", "male"],
        ["q2", "female"],
        ["p3", "male"],
        ["q3", "female"],
        ["p4", "female"],
        ["q4", "male"],
        ["q5", "male"],
        ["p5", "female"],
      ],
      [
        ["s0a", "p1"],
        ["s0b", "p1"],
        ["s0a", "q1"],
        ["s0b", "q1"],
        ["p1", "p2"],
        ["q1", "q2"],
        ["p2", "p3"],
        ["q2", "q3"],
        ["p3", "p4"],
        ["q3", "q4"],
        ["q4", "q5"],
        ["p2", "p5"],
      ],
    );

    expect(closest(clear, "p2", "q2").term).toBe("first cousin");
    expect(closest(clear, "p3", "q3").term).toBe("second cousin");
    expect(closest(clear, "p4", "q4").term).toBe("third cousin");
    expect(closest(clear, "p3", "q2").term).toBe("first cousin once removed");
    expect(closest(clear, "p2", "q3").term).toBe("first cousin once removed");
    expect(closest(clear, "p4", "q2").term).toBe("first cousin twice removed");
    expect(closest(clear, "p2", "q4").term).toBe("first cousin twice removed");
    expect(closest(clear, "p3", "q5").term).toBe("second cousin twice removed");
  });

  it("marks a half-cousin when only one ancestor is shared", () => {
    const graph = build(
      [
        ["shared", "male"],
        ["dad", "male"],
        ["uncle", "male"],
        ["me", "female"],
        ["cousin", "male"],
      ],
      [
        ["shared", "dad"],
        ["shared", "uncle"],
        ["dad", "me"],
        ["uncle", "cousin"],
      ],
    );
    expect(closest(graph, "me", "cousin").term).toBe("half-first cousin");
  });

  it("uses neutral terms when sex is unknown", () => {
    const graph = build(
      ["gp", "parent", "other", "me", "sibling", "uncle", "nibling"],
      [
        ["gp", "parent"],
        ["gp", "uncle"],
        ["parent", "me"],
        ["other", "me"],
        ["parent", "sibling"],
        ["other", "sibling"],
        ["sibling", "nibling"],
      ],
    );
    expect(closest(graph, "me", "parent").term).toBe("parent");
    expect(closest(graph, "me", "sibling").term).toBe("sibling");
    expect(closest(graph, "me", "uncle").term).toBe("parent's sibling");
    expect(closest(graph, "me", "nibling").term).toBe("sibling's child");
  });

  it("names spouses, in-laws, and relatives by marriage", () => {
    const graph = build(
      [
        ["me", "male"],
        ["wife", "female"],
        ["ex", "female"],
        ["fil", "male"],
        ["bil", "male"],
        ["brother", "male"],
        ["sil", "female"],
        ["daughter", "female"],
        ["sol", "male"],
        ["uncle", "male"],
        ["auntmar", "female"],
        ["dad", "male"],
        ["mom", "female"],
        ["gpa", "male"],
        ["gma", "female"],
        ["gfil", "male"],
        ["gmil", "female"],
        ["fil-sib", "female"],
        ["wc", "female"],
      ],
      [
        ["dad", "me"],
        ["mom", "me"],
        ["dad", "brother"],
        ["mom", "brother"],
        ["gpa", "dad"],
        ["gma", "dad"],
        ["gpa", "uncle"],
        ["gma", "uncle"],
        ["fil", "wife"],
        ["fil", "bil"],
        ["gfil", "fil"],
        ["gmil", "fil"],
        ["gfil", "fil-sib"],
        ["gmil", "fil-sib"],
        ["fil-sib", "wc"],
        ["me", "daughter"],
        ["wife", "daughter"],
      ],
      [
        ["me", "wife", "married"],
        ["me", "ex", "divorced"],
        ["brother", "sil", "married"],
        ["daughter", "sol", "married"],
        ["uncle", "auntmar", "married"],
      ],
    );

    expect(closest(graph, "me", "wife").term).toBe("wife");
    expect(closest(graph, "me", "ex").term).toBe("ex-wife");
    expect(terms(graph, "me", "fil")).toContain("father-in-law");
    expect(terms(graph, "me", "bil")).toContain("brother-in-law");
    expect(terms(graph, "me", "sil")).toContain("sister-in-law");
    expect(terms(graph, "me", "sol")).toContain("son-in-law");
    expect(terms(graph, "me", "auntmar")).toContain("aunt by marriage");
    expect(terms(graph, "me", "wc")).toContain("spouse's first cousin");
  });

  it("names stepfather, stepson, and an adoptive father", () => {
    const graph = build(
      [
        ["me", "female"],
        ["mom", "female"],
        ["stepdad", "male"],
        ["husband", "male"],
        ["stepson", "male"],
        ["af", "male"],
        ["ff", "male"],
        ["dad", "male"],
        ["stepbro", "male"],
      ],
      [
        ["mom", "me"],
        ["dad", "me"],
        ["dad", "stepbro", "step"],
        ["af", "me", "adoptive"],
        ["ff", "me", "foster"],
        ["husband", "stepson"],
      ],
      [
        ["mom", "stepdad", "married"],
        ["me", "husband", "married"],
      ],
    );
    expect(closest(graph, "me", "stepdad").term).toBe("stepfather");
    expect(closest(graph, "me", "stepson").term).toBe("stepson");
    expect(closest(graph, "me", "af").term).toBe("adoptive father");
    expect(closest(graph, "me", "ff").term).toBe("foster father");
    expect(closest(graph, "me", "stepbro").term).toBe("stepbrother");
  });

  it("keeps both spouse and uncle when an uncle marries his niece", () => {
    const graph = build(
      [
        ["gf", "male"],
        ["gm", "female"],
        ["mom", "female"],
        ["uncle", "male"],
        ["niece", "female"],
      ],
      [
        ["gf", "mom"],
        ["gm", "mom"],
        ["gf", "uncle"],
        ["gm", "uncle"],
        ["mom", "niece"],
      ],
      [["niece", "uncle", "married"]],
    );
    const found = terms(graph, "niece", "uncle");
    expect(found[0]).toBe("husband");
    expect(found).toContain("uncle");
  });

  it("reports a maternal grandmother who is also a father's first cousin", () => {
    const graph = build(
      [
        ["sg1", "male"],
        ["sg2", "female"],
        ["fp", "male"],
        ["gp", "female"],
        ["f", "male"],
        ["g", "female"],
        ["m", "female"],
        ["me", "male"],
      ],
      [
        ["sg1", "fp"],
        ["sg2", "fp"],
        ["sg1", "gp"],
        ["sg2", "gp"],
        ["fp", "f"],
        ["gp", "g"],
        ["g", "m"],
        ["f", "me"],
        ["m", "me"],
      ],
    );
    const found = relationshipsBetween(graph, "me", "g");
    expect(found[0]).toMatchObject({
      term: "grandmother",
      side: "maternal",
      pathDescription: "your maternal grandmother",
    });
    const cousin = found.find((relationship) => relationship.term === "first cousin once removed");
    expect(cousin).toMatchObject({
      side: "paternal",
      pathDescription: "father's first cousin",
    });
    expect(found.map((relationship) => relationship.term)).toEqual(["grandmother", "first cousin once removed"]);
  });

  it("falls back when people share no recorded connection", () => {
    const graph = build(["me", "stranger"], []);
    expect(closest(graph, "me", "stranger").term).toBe("No known relation");
    expect(relationshipsBetween(graph, "me", "me")).toEqual([]);
  });

  it("says related by marriage for a chain that is not a direct in-law", () => {
    const graph = build(
      [
        ["me", "male"],
        ["wife", "female"],
        ["her-sister", "female"],
        ["her-husband", "male"],
        ["parent", "male"],
      ],
      [
        ["parent", "wife"],
        ["parent", "her-sister"],
      ],
      [
        ["me", "wife"],
        ["her-sister", "her-husband"],
      ],
    );
    expect(closest(graph, "me", "her-sister").term).toBe("sister-in-law");
    expect(closest(graph, "me", "her-husband").term).toBe("Related by marriage");
  });

  it("stops at 15 generations and stays fast for a large graph", () => {
    const ids = Array.from({ length: 2000 }, (_, index) => `p${index}`);
    const links: [string, string][] = [];
    for (let index = 0; index < 40; index += 1) {
      const parent = ids[index];
      const child = ids[index + 1];
      if (parent && child) links.push([parent, child]);
    }
    const graph = build(ids, links);
    const started = Date.now();
    expect(closest(graph, "p15", "p0").term).toBe("great-great-great-great-great-great-great-great-great-great-great-great-great-grandparent");
    expect(closest(graph, "p16", "p0").term).toBe("No known relation");
    expect(Date.now() - started).toBeLessThan(500);
  });
});
