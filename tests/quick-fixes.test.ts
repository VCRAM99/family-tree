import { describe, expect, it } from "vitest";

import { createGraphIndex, defaultPersonId, siblings, type GraphPerson, type ParentKind, type TreeGraph } from "@/lib/family-graph";
import { relationshipsBetween } from "@/lib/kinship";
import { clarifyFamilyEdges, computeLayout, type LayoutEdge } from "@/lib/layout";
import { carriedDraftPatch, mergeSavedPerson } from "@/lib/person-edits";
import { cardYearLabel } from "@/lib/person-format";
import { nodeExtraLines, searchPeople, emptyFilters } from "@/lib/tree-search";

function person(id: string, patch: Partial<GraphPerson> = {}): GraphPerson {
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
    ...patch,
  };
}

function tree(people: GraphPerson[], links: [string, string][]): TreeGraph {
  return {
    persons: people,
    parentLinks: links.map(([parentId, childId], index) => ({
      id: `l${index}`,
      parentId,
      childId,
      kind: "biological" as ParentKind,
      unionId: null,
    })),
    unions: [],
  };
}

describe("tree card content", () => {
  it("shows only a precision-aware year line and at most two extra lines", () => {
    expect(cardYearLabel(person("a", { birthDate: "1968-06-01", birthDatePrecision: "year" }))).toBe("1968");
    expect(
      cardYearLabel(
        person("b", {
          birthDate: "1968-06-01",
          birthDatePrecision: "exact",
          deathDate: "2020-01-02",
          deathDatePrecision: "year",
          isDeceased: true,
        }),
      ),
    ).toBe("1968 – 2020");
    expect(cardYearLabel(person("c", { birthDate: "1920-01-01", birthDatePrecision: "approx" }))).toBe("c. 1920");
    const lines = nodeExtraLines(
      person("d", { birthPlace: "Chennai", nativePlace: "Soorakudi", currentLocation: "Austin", occupation: "Teacher" }),
      ["birth_place", "native_place", "current_location", "occupation", "birth_date"],
    );
    expect(lines.map((line) => line.text)).toEqual(["Chennai", "Soorakudi"]);
    expect(lines.some((line) => line.key === "years")).toBe(false);
  });
});

describe("draft date clear", () => {
  it("keeps an explicit null through the create patch and the dirty merge", () => {
    const draft = person("draft", { birthDate: null, birthDatePrecision: null, pending: true });
    const touched = carriedDraftPatch(draft, { birthDate: null, birthDatePrecision: null });
    expect(touched.birthDate).toBeNull();
    expect(touched.birthDatePrecision).toBeNull();
    const saved = mergeSavedPerson(draft, person("saved", { birthDate: null, birthDatePrecision: null }), touched);
    expect(saved.birthDate).toBeNull();
    expect(saved.birthDatePrecision).toBeNull();
  });
});

describe("placeholder siblings", () => {
  it("reads a placeholder-only share as a sibling and hides the placeholder", () => {
    const graph = tree(
      [person("me"), person("sib"), person("unknown", { isPlaceholder: true, firstName: "Unknown" }), person("dated", { birthDate: "1900-01-01" })],
      [
        ["unknown", "me"],
        ["unknown", "sib"],
      ],
    );
    const index = createGraphIndex(graph);
    expect(siblings(index, "me").map((entry) => ({ id: entry.person.id, half: entry.half }))).toEqual([{ id: "sib", half: false }]);
    expect(relationshipsBetween(graph, "me", "sib").map((item) => item.term)).toEqual(["sibling"]);
    expect(relationshipsBetween(graph, "me", "unknown")).toEqual([]);
    expect(defaultPersonId(graph, null, null)).toBe("dated");
    expect(searchPeople(graph, {}, emptyFilters, "Unknown", null)).toEqual([]);
  });
});

describe("edge lanes", () => {
  it("puts crossing family buses on different lanes and gaps the lower edge", () => {
    const edges: LayoutEdge[] = [
      {
        id: "a",
        familyId: "family-a",
        kind: "child",
        source: "p",
        target: "c",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 200, y: 40 },
          { x: 200, y: 80 },
        ],
      },
      {
        id: "b",
        familyId: "family-b",
        kind: "child",
        source: "q",
        target: "d",
        points: [
          { x: 40, y: 0 },
          { x: 40, y: 40 },
          { x: 160, y: 40 },
          { x: 160, y: 80 },
        ],
      },
      {
        id: "cross",
        familyId: "family-c",
        kind: "child",
        source: "r",
        target: "e",
        points: [
          { x: 100, y: 10 },
          { x: 100, y: 100 },
        ],
      },
    ];
    const clarified = clarifyFamilyEdges(edges);
    const lane = (familyId: string) => {
      const edge = clarified.find((item) => item.familyId === familyId);
      const bar = edge?.strokes?.flat().find((point, index, points) => {
        const next = points[index + 1];
        return next && Math.abs(point.y - next.y) < 0.5 && Math.abs(point.x - next.x) > 20;
      });
      return bar?.y;
    };
    expect(lane("family-a")).not.toBe(lane("family-b"));
    const lower = clarified.find((edge) => edge.id === "cross");
    expect((lower?.strokes?.length ?? 0) >= 2).toBe(true);
  });

  it("renders a pedigree collapse without shared segments from different families", async () => {
    const ids = ["sg1", "sg2", "fp", "gp", "f", "g", "m", "me"];
    const people = ids.map((id) => person(id));
    const links: [string, string][] = [
      ["sg1", "fp"],
      ["sg2", "fp"],
      ["sg1", "gp"],
      ["sg2", "gp"],
      ["fp", "f"],
      ["gp", "g"],
      ["g", "m"],
      ["f", "me"],
      ["m", "me"],
    ];
    const graph = tree(people, links);
    graph.unions = [
      { id: "u-sg", personAId: "sg1", personBId: "sg2", status: "married", startDate: null, endDate: null, sortOrder: 0 },
      { id: "u-me", personAId: "f", personBId: "m", status: "married", startDate: null, endDate: null, sortOrder: 0 },
    ];
    const layout = await computeLayout(graph);
    const pieces = layout.edges.flatMap((edge) => {
      const family = edge.familyId ?? edge.id;
      const strokes = edge.strokes ?? (edge.points ? [edge.points] : []);
      return strokes.flatMap((stroke) => {
        const out: { family: string; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
        for (let index = 1; index < stroke.length; index += 1) {
          const a = stroke[index - 1];
          const b = stroke[index];
          if (a && b) out.push({ family, a, b });
        }
        return out;
      });
    });
    let shared = 0;
    for (let left = 0; left < pieces.length; left += 1) {
      for (let right = left + 1; right < pieces.length; right += 1) {
        const a = pieces[left];
        const b = pieces[right];
        if (!a || !b || a.family === b.family) continue;
        shared = Math.max(shared, overlap(a.a, a.b, b.a, b.b));
      }
    }
    expect(shared).toBeLessThan(1);
  });
});

function overlap(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): number {
  const horizontal = Math.abs(a1.y - a2.y) < 0.5 && Math.abs(b1.y - b2.y) < 0.5 && Math.abs(a1.y - b1.y) < 0.5;
  const vertical = Math.abs(a1.x - a2.x) < 0.5 && Math.abs(b1.x - b2.x) < 0.5 && Math.abs(a1.x - b1.x) < 0.5;
  if (horizontal) return rangeOverlap(a1.x, a2.x, b1.x, b2.x);
  if (vertical) return rangeOverlap(a1.y, a2.y, b1.y, b2.y);
  return 0;
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}
