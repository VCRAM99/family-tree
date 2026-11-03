import { describe, expect, it } from "vitest";

import { createGraphIndex, formInstanceKey, type GraphPerson } from "@/lib/family-graph";
import { mergeSavedPerson } from "@/lib/person-edits";

function person(id: string, firstName: string): GraphPerson {
  return {
    id,
    treeId: "tree",
    firstName,
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
    bio: "typed bio",
    hasPhoto: false,
    phoneWhatsapp: null,
    email: null,
    instagram: null,
    facebook: null,
    customFields: {},
    pending: true,
    clientKey: "draft",
  };
}

describe("draft save", () => {
  it("keeps one form key from the draft id to the saved id", () => {
    const draft = person("draft", "");
    const saved = mergeSavedPerson(draft, { ...person("saved", "Ada"), pending: false, clientKey: undefined }, { firstName: "Ada" });
    expect(formInstanceKey(draft)).toBe(formInstanceKey(saved));
    expect(saved.id).toBe("saved");
    expect(saved.bio).toBe("typed bio");
    const index = createGraphIndex({ persons: [saved], parentLinks: [], unions: [] });
    expect(index.personById.get("draft")?.id).toBe("saved");
    expect(index.personById.get("saved")?.firstName).toBe("Ada");
  });
});
