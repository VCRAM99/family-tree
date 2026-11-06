import type { GraphPerson } from "@/lib/family-graph";

export type NameField = "firstName" | "middleName" | "lastName" | "preferredName" | "birthSurname";

/** A city row from the bundled GeoNames extract: name, region, country. */
export type CityRecord = [string, string, string];

export function cityLabel(city: CityRecord): string {
  return [city[0], city[1], city[2]].filter((part) => part.length > 0).join(", ");
}

/**
 * Unique trimmed values whose text starts with the query.
 * Prefix matches come first. The query itself is kept when it is new.
 */
export function prefixSuggestions(values: Iterable<string | null | undefined>, query: string, limit = 8): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key) || !key.startsWith(needle)) continue;
    seen.add(key);
    matches.push(trimmed);
    if (matches.length >= limit) break;
  }
  return matches;
}

export function nameSuggestions(people: Pick<GraphPerson, NameField>[], field: NameField, query: string): string[] {
  return prefixSuggestions(
    people.map((person) => person[field]),
    query,
  );
}

/** Places already stored on this tree, then bundled cities whose name starts with the query. */
export function locationSuggestions(treePlaces: Iterable<string | null | undefined>, cities: CityRecord[], query: string): string[] {
  const local = prefixSuggestions(treePlaces, query, 8);
  const needle = query.trim().toLowerCase();
  if (!needle) return local;
  const remote: string[] = [];
  for (const city of cities) {
    if (!city[0].toLowerCase().startsWith(needle)) continue;
    const label = cityLabel(city);
    remote.push(label);
    if (remote.length >= 8) break;
  }
  return prefixSuggestions([...local, ...remote], query, 8);
}

export function treePlaceValues(people: Pick<GraphPerson, "birthPlace" | "nativePlace" | "currentLocation" | "customFields">[], locationKeys: string[]): string[] {
  const values: string[] = [];
  for (const person of people) {
    values.push(person.birthPlace ?? "", person.nativePlace ?? "", person.currentLocation ?? "");
    for (const key of locationKeys) {
      const value = person.customFields[key];
      if (typeof value === "string") values.push(value);
    }
  }
  return values;
}
