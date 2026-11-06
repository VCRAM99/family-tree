import { describe, expect, it } from "vitest";

import { locationSuggestions, nameSuggestions, type CityRecord } from "@/lib/suggestions";

const people = [
  { firstName: "Ada", middleName: null, lastName: "Lovelace", preferredName: "Ada", birthSurname: "Byron" },
  { firstName: "Anne", middleName: "Isabella", lastName: "King", preferredName: null, birthSurname: "Byron" },
];

describe("name suggestions", () => {
  it("suggests names from the provided people only", () => {
    expect(nameSuggestions(people, "firstName", "a")).toEqual(["Ada", "Anne"]);
    expect(nameSuggestions(people, "birthSurname", "by")).toEqual(["Byron"]);
    expect(nameSuggestions(people, "lastName", "lov")).toEqual(["Lovelace"]);
    expect(nameSuggestions([], "firstName", "ada")).toEqual([]);
  });
});

describe("location suggestions", () => {
  const cities: CityRecord[] = [
    ["London", "England", "United Kingdom"],
    ["Lyon", "Auvergne-Rhône-Alpes", "France"],
    ["Paris", "Île-de-France", "France"],
  ];

  it("prefers places already used in the tree, then city names", () => {
    expect(locationSuggestions(["London, Ontario", "Lisbon"], cities, "lon")).toEqual([
      "London, Ontario",
      "London, England, United Kingdom",
    ]);
    expect(locationSuggestions(["Soorakudi"], cities, "soo")).toEqual(["Soorakudi"]);
  });
});
