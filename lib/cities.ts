import type { CityRecord } from "@/lib/suggestions";

/**
 * GeoNames populated places with population over 15,000.
 * Split by the first letter so a location field loads one chunk, not the whole set.
 * Source: GeoNames (https://www.geonames.org/), CC BY 4.0.
 */
const loaders: Record<string, () => Promise<CityRecord[]>> = {
  a: () => import("@/data/cities/a.json").then(read),
  b: () => import("@/data/cities/b.json").then(read),
  c: () => import("@/data/cities/c.json").then(read),
  d: () => import("@/data/cities/d.json").then(read),
  e: () => import("@/data/cities/e.json").then(read),
  f: () => import("@/data/cities/f.json").then(read),
  g: () => import("@/data/cities/g.json").then(read),
  h: () => import("@/data/cities/h.json").then(read),
  i: () => import("@/data/cities/i.json").then(read),
  j: () => import("@/data/cities/j.json").then(read),
  k: () => import("@/data/cities/k.json").then(read),
  l: () => import("@/data/cities/l.json").then(read),
  m: () => import("@/data/cities/m.json").then(read),
  n: () => import("@/data/cities/n.json").then(read),
  o: () => import("@/data/cities/o.json").then(read),
  p: () => import("@/data/cities/p.json").then(read),
  q: () => import("@/data/cities/q.json").then(read),
  r: () => import("@/data/cities/r.json").then(read),
  s: () => import("@/data/cities/s.json").then(read),
  t: () => import("@/data/cities/t.json").then(read),
  u: () => import("@/data/cities/u.json").then(read),
  v: () => import("@/data/cities/v.json").then(read),
  w: () => import("@/data/cities/w.json").then(read),
  x: () => import("@/data/cities/x.json").then(read),
  y: () => import("@/data/cities/y.json").then(read),
  z: () => import("@/data/cities/z.json").then(read),
  _: () => import("@/data/cities/_.json").then(read),
};

const cache = new Map<string, Promise<CityRecord[]>>();

function read(mod: { default: unknown }): CityRecord[] {
  return mod.default as CityRecord[];
}

export function cityChunkKey(query: string): string | null {
  const folded = query.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const letter = folded[0];
  if (!letter) return null;
  return /[a-z]/.test(letter) ? letter : "_";
}

/** Loads the one prefix chunk for the current query. Later keys stay cached in memory. */
export function loadCityChunk(query: string): Promise<CityRecord[]> {
  const key = cityChunkKey(query);
  if (!key) return Promise.resolve([]);
  const existing = cache.get(key);
  if (existing) return existing;
  const loader = loaders[key];
  if (!loader) return Promise.resolve([]);
  const pending = loader();
  cache.set(key, pending);
  return pending;
}
