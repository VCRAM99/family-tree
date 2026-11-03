import { MAX_NODE_EXTRA_LINES, type PersonField } from "@/lib/domain";
import { preferredDisplayName, type GraphPerson, type Sex, type TreeGraph } from "@/lib/family-graph";
import { relationshipsBetween } from "@/lib/kinship";

export type LifeFilter = "any" | "living" | "deceased";

export type TreeFilters = {
  location: string;
  surname: string;
  life: LifeFilter;
  sex: Sex | "any";
  decadeFrom: number | null;
  decadeTo: number | null;
  generation: number | null;
};

export const emptyFilters: TreeFilters = {
  location: "",
  surname: "",
  life: "any",
  sex: "any",
  decadeFrom: null,
  decadeTo: null,
  generation: null,
};

export type SearchHit = {
  person: GraphPerson;
  score: number;
  lifeYears: string;
  relationship: string | null;
};

export function filtersActive(filters: TreeFilters): boolean {
  return (
    filters.location.trim().length > 0 ||
    filters.surname.trim().length > 0 ||
    filters.life !== "any" ||
    filters.sex !== "any" ||
    filters.decadeFrom !== null ||
    filters.decadeTo !== null ||
    filters.generation !== null
  );
}

export function peopleMatching(graph: TreeGraph, generations: Record<string, number>, filters: TreeFilters): GraphPerson[] {
  return graph.persons.filter((person) => !person.pending && !person.isPlaceholder && matchesFilters(person, generations[person.id] ?? 0, filters));
}

export function searchPeople(
  graph: TreeGraph,
  generations: Record<string, number>,
  filters: TreeFilters,
  query: string,
  viewerId: string | null,
): SearchHit[] {
  const needle = query.trim();
  const hits: SearchHit[] = [];
  for (const person of graph.persons) {
    if (person.pending || person.isPlaceholder) continue;
    if (!matchesFilters(person, generations[person.id] ?? 0, filters)) continue;
    const score = needle ? fuzzyScore(needle, person) : 1;
    if (score <= 0) continue;
    hits.push({
      person,
      score,
      lifeYears: lifeYears(person),
      relationship: relationshipTo(graph, viewerId, person.id),
    });
  }
  hits.sort((a, b) => b.score - a.score || preferredDisplayName(a.person).localeCompare(preferredDisplayName(b.person)) || a.person.id.localeCompare(b.person.id));
  return hits.slice(0, 30);
}

export function lifeYears(person: Pick<GraphPerson, "birthDate" | "deathDate" | "isDeceased">): string {
  const birth = person.birthDate?.slice(0, 4) ?? "";
  const death = person.deathDate?.slice(0, 4) ?? "";
  if (birth && death) return `${birth}–${death}`;
  if (birth && (person.isDeceased || person.deathDate)) return `${birth}–`;
  return birth;
}

/** Extra lines under the name and years. Years are drawn separately and do not count. */
export function nodeExtraLines(person: GraphPerson, fields: readonly PersonField[]): { key: string; text: string }[] {
  const lines: { key: string; text: string }[] = [];
  if (fields.includes("birth_place") && person.birthPlace) lines.push({ key: "birth_place", text: person.birthPlace });
  if (fields.includes("native_place") && person.nativePlace) lines.push({ key: "native_place", text: person.nativePlace });
  if (fields.includes("current_location") && person.currentLocation) lines.push({ key: "current_location", text: person.currentLocation });
  if (fields.includes("occupation") && person.occupation) lines.push({ key: "occupation", text: person.occupation });
  return lines.slice(0, MAX_NODE_EXTRA_LINES);
}

function matchesFilters(person: GraphPerson, generation: number, filters: TreeFilters): boolean {
  const location = filters.location.trim().toLowerCase();
  if (location) {
    const places = [person.birthPlace, person.nativePlace, person.currentLocation].map((place) => place?.toLowerCase() ?? "");
    if (!places.some((place) => place.includes(location))) return false;
  }
  const surname = filters.surname.trim().toLowerCase();
  if (surname) {
    const names = [person.lastName, person.birthSurname].map((name) => name?.toLowerCase() ?? "");
    if (!names.some((name) => name.includes(surname))) return false;
  }
  const deceased = person.isDeceased || Boolean(person.deathDate);
  if (filters.life === "living" && deceased) return false;
  if (filters.life === "deceased" && !deceased) return false;
  if (filters.sex !== "any" && person.sex !== filters.sex) return false;
  if (filters.generation !== null && generation !== filters.generation) return false;
  if (filters.decadeFrom !== null || filters.decadeTo !== null) {
    const year = Number(person.birthDate?.slice(0, 4));
    if (!Number.isFinite(year)) return false;
    const decade = Math.floor(year / 10) * 10;
    if (filters.decadeFrom !== null && decade < filters.decadeFrom) return false;
    if (filters.decadeTo !== null && decade > filters.decadeTo) return false;
  }
  return true;
}

function fuzzyScore(query: string, person: GraphPerson): number {
  const needle = query.toLowerCase();
  const fields = [person.preferredName, person.firstName, person.middleName, person.lastName, person.birthSurname];
  let best = 0;
  for (const field of fields) {
    const score = scoreText(needle, field ?? "");
    if (score > best) best = score;
  }
  const combined = fields.filter(Boolean).join(" ");
  return Math.max(best, scoreText(needle, combined));
}

function scoreText(needle: string, text: string): number {
  const haystack = text.toLowerCase();
  if (!needle || !haystack) return 0;
  if (haystack === needle) return 200;
  const at = haystack.indexOf(needle);
  if (at === 0) return 160;
  if (at > 0) return 120 - Math.min(at, 40);
  let cursor = 0;
  for (const character of haystack) {
    if (character === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return 50;
  }
  return 0;
}

function relationshipTo(graph: TreeGraph, viewerId: string | null, personId: string): string | null {
  if (!viewerId) return null;
  if (viewerId === personId) return "You";
  return relationshipsBetween(graph, viewerId, personId)[0]?.term ?? null;
}
