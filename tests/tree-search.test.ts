import { describe, expect, it } from "vitest";

import type { GraphPerson, TreeGraph } from "@/lib/family-graph";
import { emptyFilters, peopleMatching, searchPeople, type TreeFilters } from "@/lib/tree-search";

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

const graph: TreeGraph = {
  persons: [
    person("me", { firstName: "Varun", preferredName: "V", lastName: "Raman", sex: "male", birthDate: "1990-04-01", birthDatePrecision: "exact", birthPlace: "Chennai" }),
    person("amma", {
      firstName: "Lakshmi",
      birthSurname: "Iyer",
      lastName: "Iyer",
      sex: "female",
      birthDate: "1962-03-01",
      birthDatePrecision: "exact",
      nativePlace: "Soorakudi",
      isDeceased: false,
    }),
    person("appa", {
      firstName: "Ramanathan",
      preferredName: "Raman",
      sex: "male",
      birthDate: "1958-01-01",
      birthDatePrecision: "exact",
      deathDate: "2010-01-01",
      deathDatePrecision: "exact",
      isDeceased: true,
      currentLocation: "Madurai",
    }),
  ],
  parentLinks: [
    { id: "1", parentId: "appa", childId: "me", kind: "biological", unionId: null },
    { id: "2", parentId: "amma", childId: "me", kind: "biological", unionId: null },
  ],
  unions: [],
};

const generations = { me: 1, amma: 0, appa: 0 };

describe("tree search", () => {
  it("fuzzy-matches preferred, middle, and birth surnames", () => {
    const hits = searchPeople(graph, generations, emptyFilters, "ram", "me");
    expect(hits.map((hit) => hit.person.id)).toEqual(["appa", "me"]);
    expect(hits.find((hit) => hit.person.id === "appa")?.relationship).toBe("father");
    expect(hits.find((hit) => hit.person.id === "me")?.relationship).toBe("You");
    expect(searchPeople(graph, generations, emptyFilters, "iyer", null).map((hit) => hit.person.id)).toEqual(["amma"]);
  });

  it("filters by place, surname, life, sex, decade, and generation", () => {
    const filters: TreeFilters = { ...emptyFilters, location: "madurai", life: "deceased", sex: "male", decadeFrom: 1950, decadeTo: 1950, generation: 0 };
    expect(peopleMatching(graph, generations, filters).map((person) => person.id)).toEqual(["appa"]);
    expect(peopleMatching(graph, generations, { ...emptyFilters, surname: "iyer" }).map((person) => person.id)).toEqual(["amma"]);
    expect(peopleMatching(graph, generations, { ...emptyFilters, life: "living" }).map((person) => person.id).sort()).toEqual(["amma", "me"]);
  });
});