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
  const bars = new Map<string, number>();
  for (const [id, list] of families) {
    const sample = list[0];
    if (sample) bars.set(id, barY(sample));
  }
  const groups = new Map<number, string[]>();
  for (const [id, y] of bars) {
    const key = Math.round(y / 8);
    const list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
  }
  for (const ids of groups.values()) {
    ids.sort((a, b) => a.localeCompare(b));
    const base = Math.min(...ids.map((id) => bars.get(id) ?? 0));
    ids.forEach((id, lane) => {
      const from = bars.get(id) ?? base;
      const to = base + lane * LANE;
      if (Math.abs(from - to) < 0.5) return;
      for (const edge of families.get(id) ?? []) {
        if (!edge.points) continue;
        for (const point of edge.points) {
          if (Math.abs(point.y - from) < 1.5) point.y = to;
        }
      }
    });
  }
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

function punchCrossings(edges: LayoutEdge[]): LayoutEdge[] {
  type Segment = { edge: LayoutEdge; index: number; a: Point; b: Point; family: string };
  const segments: Segment[] = [];
  for (const edge of edges) {
    const points = edge.points ?? [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (!a || !b) continue;
      segments.push({ edge, index, a, b, family: familyKey(edge) });
    }
  }
  const gaps = new Map<LayoutEdge, Point[]>();
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const a = segments[left];
      const b = segments[right];
      if (!a || !b || a.family === b.family) continue;
      const hit = intersection(a.a, a.b, b.a, b.b);
      if (!hit) continue;
      const lower = averageY(a.a, a.b) >= averageY(b.a, b.b) ? a.edge : b.edge;
      const list = gaps.get(lower) ?? [];
      list.push(hit);
      gaps.set(lower, list);
    }
  }
  return edges.map((edge) => {
    const points = edge.points ?? [];
    const holes = gaps.get(edge) ?? [];
    return { ...edge, strokes: holes.length > 0 ? applyGaps(points, holes) : points.length > 1 ? [points] : undefined };
  });
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
  let parts: Point[][] = [points.map((point) => ({ ...point }))];
  for (const gap of gaps) parts = parts.flatMap((part) => splitPart(part, gap));
  return parts.filter((part) => part.length >= 2 && span(part) > 1);
}

function splitPart(points: Point[], gap: Point): Point[][] {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < 1) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t = ((gap.x - start.x) * dx + (gap.y - start.y) * dy) / (length * length);
    if (t <= 0.02 || t >= 0.98) continue;
    const nearestX = start.x + t * dx;
    const nearestY = start.y + t * dy;
    if (Math.hypot(nearestX - gap.x, nearestY - gap.y) > 1.5) continue;
    const before = Math.max(0, t * length - GAP);
    const after = Math.min(length, t * length + GAP);
    const leftEnd = pointAt(start, end, before);
    const rightStart = pointAt(start, end, after);
    const left = [...points.slice(0, index + 1), leftEnd];
    const right = [rightStart, ...points.slice(index + 1)];
    return [left, right];
  }
  return [points];
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
