import type { LayoutEdge } from "./types";

const LANE = 14;
const VERTICAL_SHIFT = 8;
const GAP = 7;

type Point = { x: number; y: number };

/** Give each sibling bus its own lane, separate stacked verticals, and break the lower line at a crossing. */
export function clarifyFamilyEdges(edges: LayoutEdge[]): LayoutEdge[] {
  const next = edges.map((edge) => ({
    ...edge,
    points: edge.points?.map((point) => ({ ...point })),
  }));
  assignLanes(next);
  offsetVerticals(next);
  return punchCrossings(next);
}

function familyKey(edge: LayoutEdge): string {
  return edge.familyId ?? edge.id;
}

function assignLanes(edges: LayoutEdge[]) {
  const families = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    if (edge.kind !== "child" || !edge.points || !edge.familyId) continue;
    const list = families.get(edge.familyId) ?? [];
    list.push(edge);
    families.set(edge.familyId, list);
  }
  type Bar = { id: string; y: number; minX: number; maxX: number };
  const groups = new Map<number, Bar[]>();
  for (const [id, list] of families) {
    const sample = list[0];
    if (!sample) continue;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    const y = barY(sample);
    for (const edge of list) {
      for (const point of edge.points ?? []) {
        if (Math.abs(point.y - y) > 1.5) continue;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
      }
    }
    if (!Number.isFinite(minX) || maxX - minX < 1) continue;
    const key = Math.round(y / 8);
    const row = groups.get(key) ?? [];
    row.push({ id, y, minX, maxX });
    groups.set(key, row);
  }
  for (const row of groups.values()) {
    const lanes = colorIntervals(row);
    const base = Math.min(...row.map((bar) => bar.y));
    for (const bar of row) {
      const from = bar.y;
      const to = base + (lanes.get(bar.id) ?? 0) * LANE;
      if (Math.abs(from - to) < 0.5) continue;
      for (const edge of families.get(bar.id) ?? []) {
        if (!edge.points) continue;
        for (const point of edge.points) {
          if (Math.abs(point.y - from) < 1.5) point.y = to;
        }
      }
    }
  }
}

/** Smallest lane whose x-range is free. Touching endpoints may share a lane. */
function colorIntervals(bars: { id: string; minX: number; maxX: number }[]): Map<string, number> {
  type Event = { x: number; kind: number; id: string; maxX: number };
  const events: Event[] = [];
  for (const bar of bars) {
    events.push({ x: bar.minX, kind: 1, id: bar.id, maxX: bar.maxX });
    events.push({ x: bar.maxX, kind: 0, id: bar.id, maxX: bar.maxX });
  }
  events.sort((a, b) => a.x - b.x || a.kind - b.kind || a.id.localeCompare(b.id));
  const lanes = new Map<string, number>();
  const active = new Map<string, number>();
  const free: number[] = [];
  let next = 0;
  for (const event of events) {
    if (event.kind === 0) {
      const lane = active.get(event.id);
      if (lane === undefined) continue;
      active.delete(event.id);
      free.push(lane);
      continue;
    }
    free.sort((a, b) => a - b);
    const lane = free.shift() ?? next++;
    active.set(event.id, lane);
    lanes.set(event.id, lane);
  }
  return lanes;
}

function barY(edge: LayoutEdge): number {
  const points = edge.points ?? [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    if (Math.abs(start.y - end.y) < 0.5 && Math.abs(start.x - end.x) > 1) return start.y;
  }
  return points[1]?.y ?? 0;
}

function offsetVerticals(edges: LayoutEdge[]) {
  type Vertical = { edge: LayoutEdge; index: number; x: number; family: string };
  const verticals: Vertical[] = [];
  for (const edge of edges) {
    const points = edge.points;
    if (!points) continue;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      if (Math.abs(start.x - end.x) < 0.5 && Math.abs(start.y - end.y) > 1) {
        verticals.push({ edge, index, x: start.x, family: familyKey(edge) });
      }
    }
  }
  const byX = new Map<number, Vertical[]>();
  for (const vertical of verticals) {
    const key = Math.round(vertical.x);
    const list = byX.get(key) ?? [];
    list.push(vertical);
    byX.set(key, list);
  }
  for (const list of byX.values()) {
    const families = [...new Set(list.map((item) => item.family))].sort((a, b) => a.localeCompare(b));
    if (families.length < 2) continue;
    const shift = new Map(families.map((family, lane) => [family, lane * VERTICAL_SHIFT]));
    for (const vertical of list) {
      const amount = shift.get(vertical.family) ?? 0;
      if (amount === 0) continue;
      const points = vertical.edge.points;
      const start = points?.[vertical.index];
      const end = points?.[vertical.index + 1];
      if (!start || !end) continue;
      start.x += amount;
      end.x += amount;
    }
  }
}

type Segment = {
  edge: LayoutEdge;
  index: number;
  a: Point;
  b: Point;
  family: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function punchCrossings(edges: LayoutEdge[]): LayoutEdge[] {
  const segments: Segment[] = [];
  for (const edge of edges) {
    const points = edge.points ?? [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (!a || !b) continue;
      segments.push({
        edge,
        index,
        a,
        b,
        family: familyKey(edge),
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      });
    }
  }
  const gaps = collectCrossings(segments);
  return edges.map((edge) => {
    const points = edge.points ?? [];
    const holes = gaps.get(edge) ?? [];
    return { ...edge, strokes: holes.length > 0 ? applyGaps(points, holes) : points.length > 1 ? [points] : undefined };
  });
}

/**
 * Crossings are almost always a horizontal bus against a vertical drop.
 * Each generation gap is swept in x, so a segment is compared with the bars
 * that actually cover it instead of every other segment.
 */
function collectCrossings(segments: Segment[]): Map<LayoutEdge, Point[]> {
  const gaps = new Map<LayoutEdge, Point[]>();
  const note = (left: Segment, right: Segment, hit: Point) => {
    const lower = averageY(left.a, left.b) >= averageY(right.a, right.b) ? left.edge : right.edge;
    const list = gaps.get(lower) ?? [];
    list.push(hit);
    gaps.set(lower, list);
  };

  const horizontals: Segment[] = [];
  const verticals: Segment[] = [];
  const diagonals: Segment[] = [];
  for (const segment of segments) {
    const dx = segment.maxX - segment.minX;
    const dy = segment.maxY - segment.minY;
    if (dy < 0.5 && dx > 1) horizontals.push(segment);
    else if (dx < 0.5 && dy > 1) verticals.push(segment);
    else if (dx > 0.5 || dy > 0.5) diagonals.push(segment);
  }

  const bands = new Map<number, { y: number; bars: Segment[]; drops: Segment[] }>();
  for (const bar of horizontals) {
    const key = Math.round(bar.a.y);
    const band = bands.get(key) ?? { y: bar.a.y, bars: [], drops: [] };
    band.bars.push(bar);
    bands.set(key, band);
  }
  const ordered = [...bands.values()].sort((a, b) => a.y - b.y);
  const ys = ordered.map((band) => band.y);
  for (const drop of verticals) {
    const span = drop.maxY - drop.minY;
    const low = lowerBound(ys, drop.minY + span * 0.04);
    const high = upperBound(ys, drop.maxY - span * 0.04);
    for (let index = low; index < high; index += 1) ordered[index]?.drops.push(drop);
  }
  for (const band of ordered) sweepBand(band.bars, band.drops, note);
  if (diagonals.length > 0) diagonalHits(diagonals, segments, note);
  return gaps;
}

function sweepBand(bars: Segment[], drops: Segment[], note: (left: Segment, right: Segment, hit: Point) => void) {
  type Event = { x: number; kind: number; seg: Segment };
  const events: Event[] = [];
  for (const bar of bars) {
    events.push({ x: bar.minX, kind: 0, seg: bar });
    events.push({ x: bar.maxX, kind: 2, seg: bar });
  }
  for (const drop of drops) events.push({ x: drop.a.x, kind: 1, seg: drop });
  events.sort((a, b) => a.x - b.x || a.kind - b.kind);
  const active: Segment[] = [];
  for (const event of events) {
    if (event.kind === 0) {
      active.push(event.seg);
      continue;
    }
    if (event.kind === 2) {
      const index = active.indexOf(event.seg);
      if (index >= 0) active.splice(index, 1);
      continue;
    }
    for (const bar of active) {
      if (bar.family === event.seg.family) continue;
      const hit = intersection(bar.a, bar.b, event.seg.a, event.seg.b);
      if (hit) note(bar, event.seg, hit);
    }
  }
}

const CELL = 96;

function diagonalHits(diagonals: Segment[], segments: Segment[], note: (left: Segment, right: Segment, hit: Point) => void) {
  const buckets = new Map<string, Segment[]>();
  const cellsOf = (segment: Segment) => {
    const keys: string[] = [];
    const x0 = Math.floor(segment.minX / CELL);
    const x1 = Math.floor(segment.maxX / CELL);
    const y0 = Math.floor(segment.minY / CELL);
    const y1 = Math.floor(segment.maxY / CELL);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) keys.push(`${x}:${y}`);
    }
    return keys;
  };
  for (const segment of segments) {
    for (const key of cellsOf(segment)) {
      const list = buckets.get(key) ?? [];
      list.push(segment);
      buckets.set(key, list);
    }
  }
  const seen = new Set<string>();
  for (const diagonal of diagonals) {
    for (const key of cellsOf(diagonal)) {
      for (const other of buckets.get(key) ?? []) {
        if (other === diagonal || other.family === diagonal.family) continue;
        const pair = diagonal.edge.id < other.edge.id ? `${diagonal.edge.id}:${diagonal.index}:${other.edge.id}:${other.index}` : `${other.edge.id}:${other.index}:${diagonal.edge.id}:${diagonal.index}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        const hit = intersection(diagonal.a, diagonal.b, other.a, other.b);
        if (hit) note(diagonal, other, hit);
      }
    }
  }
}

function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((values[mid] ?? 0) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((values[mid] ?? 0) <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function averageY(a: Point, b: Point): number {
  return (a.y + b.y) / 2;
}

function intersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  if (t <= 0.04 || t >= 0.96 || u <= 0.04 || u >= 0.96) return null;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

function applyGaps(points: Point[], gaps: Point[]): Point[][] {
  const cuts = new Map<number, number[]>();
  for (const gap of gaps) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < 1) continue;
      const t = ((gap.x - start.x) * dx + (gap.y - start.y) * dy) / lengthSq;
      if (t <= 0.02 || t >= 0.98) continue;
      const nearestX = start.x + t * dx;
      const nearestY = start.y + t * dy;
      if ((nearestX - gap.x) ** 2 + (nearestY - gap.y) ** 2 > 2.25) continue;
      const list = cuts.get(index) ?? [];
      list.push(t * Math.sqrt(lengthSq));
      cuts.set(index, list);
      break;
    }
  }
  if (cuts.size === 0) return [points];
  const parts: Point[][] = [];
  let current: Point[] = [];
  const first = points[0];
  if (first) current.push(first);
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const distances = cuts.get(index);
    if (!distances || distances.length === 0) {
      current.push(end);
      continue;
    }
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const unique = [...new Set(distances.map((distance) => Math.round(distance * 10) / 10))].sort((a, b) => a - b);
    let cursor = 0;
    for (const distance of unique) {
      const before = Math.max(cursor, distance - GAP);
      const after = Math.min(length, distance + GAP);
      if (before > cursor + 0.5) current.push(pointAt(start, end, before));
      if (span(current) > 1) parts.push(current);
      current = after < length - 0.5 ? [pointAt(start, end, after)] : [];
      cursor = after;
    }
    if (current.length > 0 && cursor < length - 0.5) current.push(end);
    else if (cursor < length - 0.5) current = [pointAt(start, end, cursor), end];
  }
  if (span(current) > 1) parts.push(current);
  return parts.filter((part) => part.length >= 2 && span(part) > 1);
}

function pointAt(start: Point, end: Point, distance: number): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  return { x: start.x + ((end.x - start.x) / length) * distance, y: start.y + ((end.y - start.y) / length) * distance };
}

function span(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}
