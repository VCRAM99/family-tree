import { childrenGrouped, createGraphIndex, spouses, type GraphIndex, type TreeGraph } from "@/lib/family-graph";

import { orderedGenerationIds } from "./model";
import { PERSON_HEIGHT, PERSON_WIDTH, type LayoutEdge, type LayoutPoint, type LayoutResult } from "./types";

const SPOUSE_GAP = 28;
const SIBLING_GAP = 36;
const BLOCK_GAP = 64;
const ROW_GAP = 96;

/** Couple blocks and bus edges. Junctions are not placed. */
export function arrangeFamilies(graph: TreeGraph, generations: Map<string, number>, hint?: Record<string, LayoutPoint>): LayoutResult {
  const index = createGraphIndex(graph);
  const order = orderedGenerationIds(index, generations);
  const generationRecord: Record<string, number> = {};
  for (const [id, generation] of generations) generationRecord[id] = generation;

  const positions: Record<string, LayoutPoint> = {};
  const max = Math.max(0, ...generations.values());
  const blocksByGeneration = new Map<number, string[][]>();
  for (let generation = 0; generation <= max; generation += 1) {
    let ids = order.get(generation) ?? [];
    if (hint) {
      const blocks = coupleBlocks(ids, index);
      blocks.sort((a, b) => hintX(a, hint) - hintX(b, hint) || (a[0] ?? "").localeCompare(b[0] ?? ""));
      ids = blocks.flat();
    }
    blocksByGeneration.set(generation, coupleBlocks(ids, index));
  }

  let cursor = 0;
  for (const block of blocksByGeneration.get(0) ?? []) {
    cursor = placeBlock(block, cursor, 0, positions) + BLOCK_GAP;
  }

  for (let generation = 0; generation < max; generation += 1) {
    const placed = new Set<string>();
    const groups = childGroups(index, generations, positions, generation);
    let nextCursor = 0;
    for (const group of groups) {
      const blocks: string[][] = [];
      for (const childId of group.childIds) {
        const block = (blocksByGeneration.get(generation + 1) ?? []).find((item) => item.includes(childId));
        if (!block || block.some((id) => placed.has(id))) continue;
        blocks.push(block);
        for (const id of block) placed.add(id);
      }
      if (blocks.length === 0) continue;
      const width = blocks.reduce((sum, block) => sum + blockWidth(block), 0) + (blocks.length - 1) * SIBLING_GAP;
      let left = Math.max(nextCursor, group.anchor - width / 2);
      blocks.forEach((block, index) => {
        const right = placeBlock(block, left, generation + 1, positions);
        left = right + (index < blocks.length - 1 ? SIBLING_GAP : 0);
      });
      nextCursor = left + BLOCK_GAP;
    }
    for (const block of blocksByGeneration.get(generation + 1) ?? []) {
      if (block.some((id) => placed.has(id))) continue;
      nextCursor = placeBlock(block, nextCursor, generation + 1, positions) + BLOCK_GAP;
      for (const id of block) placed.add(id);
    }
  }

  return { positions, edges: familyEdges(graph, index, positions), generations: generationRecord };
}

function childGroups(
  index: GraphIndex,
  generations: Map<string, number>,
  positions: Record<string, LayoutPoint>,
  generation: number,
): { anchor: number; childIds: string[] }[] {
  const seen = new Set<string>();
  const groups: { anchor: number; childIds: string[] }[] = [];
  const parents = [...(index.personById.keys())].filter((id) => generations.get(id) === generation).sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0));
  for (const parentId of parents) {
    const parent = positions[parentId];
    if (!parent) continue;
    for (const group of childrenGrouped(index, parentId)) {
      const childIds = group.children.map((child) => child.id).filter((id) => generations.get(id) === generation + 1 && !seen.has(id));
      if (childIds.length === 0) continue;
      for (const id of childIds) seen.add(id);
      const other = group.otherParent ? positions[group.otherParent.id] : null;
      const anchor = other ? (centerOf(parent) + centerOf(other)) / 2 : centerOf(parent);
      groups.push({ anchor, childIds });
    }
  }
  groups.sort((a, b) => a.anchor - b.anchor || (a.childIds[0] ?? "").localeCompare(b.childIds[0] ?? ""));
  return groups;
}

function familyEdges(graph: TreeGraph, index: GraphIndex, positions: Record<string, LayoutPoint>): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  const boxes = Object.values(positions);
  for (const union of [...graph.unions].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))) {
    const left = positions[union.personAId];
    const right = positions[union.personBId];
    if (!left || !right) continue;
    edges.push({
      id: `spouse-${union.id}`,
      source: union.personAId,
      target: union.personBId,
      kind: "spouse",
      unionStatus: union.status,
      points: spousePoints(left, right, boxes),
    });
  }

  const seen = new Set<string>();
  for (const person of graph.persons) {
    for (const group of childrenGrouped(index, person.id)) {
      const children = group.children.filter((child) => positions[child.id]);
      if (children.length === 0) continue;
      const key = `${group.union?.id ?? person.id}:${children.map((child) => child.id).sort().join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parents = [positions[person.id], group.otherParent ? positions[group.otherParent.id] : undefined].filter((point): point is LayoutPoint => Boolean(point));
      if (parents.length === 0) continue;
      const anchor = busAnchor(parents);
      const barY = Math.max(...parents.map((point) => point.y + point.height)) + 32;
      for (const child of children) {
        const point = positions[child.id];
        if (!point) continue;
        const link = (index.parentsOf.get(child.id) ?? []).find((item) => item.parentId === person.id);
        const childX = point.x + point.width / 2;
        edges.push({
          id: `bus-${group.union?.id ?? person.id}-${child.id}`,
          source: person.id,
          target: child.id,
          kind: "child",
          parentKind: link?.kind,
          familyId: group.union?.id ?? person.id,
          tooltip: link && link.kind !== "biological" ? kindLabel(link.kind) : undefined,
          points: [
            anchor,
            { x: anchor.x, y: barY },
            { x: childX, y: barY },
            { x: childX, y: point.y },
          ],
        });
      }
    }
  }
  return edges;
}

function spousePoints(a: LayoutPoint, b: LayoutPoint, boxes: LayoutPoint[]): { x: number; y: number }[] {
  const left = a.x <= b.x ? a : b;
  const right = a.x <= b.x ? b : a;
  if (Math.abs(a.y - b.y) < 2) {
    const y = left.y + left.height / 2;
    return [
      { x: left.x + left.width, y },
      { x: right.x, y },
    ];
  }
  const higher = a.y <= b.y ? a : b;
  const lower = a.y <= b.y ? b : a;
  const channel = higher.y + higher.height + 24;
  const fromX = higher.x + higher.width / 2;
  const toX = lower.x + lower.width / 2;
  const gutter = Math.min(...boxes.map((box) => box.x)) - 20;
  const dropX = verticalClear(fromX, higher.y + higher.height, channel, boxes) ? fromX : gutter;
  return [
    { x: fromX, y: higher.y + higher.height },
    { x: dropX, y: higher.y + higher.height },
    { x: dropX, y: channel },
    { x: toX, y: channel },
    { x: toX, y: lower.y },
  ];
}

function busAnchor(parents: LayoutPoint[]): { x: number; y: number } {
  if (parents.length >= 2) {
    const [first, second] = [...parents].sort((a, b) => a.x - b.x);
    if (first && second && Math.abs(first.y - second.y) < 2) {
      return { x: (first.x + first.width + second.x) / 2, y: first.y + first.height / 2 };
    }
  }
  const lower = [...parents].sort((a, b) => b.y - a.y)[0] ?? parents[0];
  if (!lower) return { x: 0, y: 0 };
  return { x: lower.x + lower.width / 2, y: lower.y + lower.height };
}

function verticalClear(x: number, y1: number, y2: number, boxes: LayoutPoint[]): boolean {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return !boxes.some((box) => x > box.x + 1 && x < box.x + box.width - 1 && bottom > box.y + 1 && top < box.y + box.height - 1);
}

function coupleBlocks(ids: string[], index: GraphIndex): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const id of ids) {
    const previous = current[current.length - 1];
    if (!previous || spouses(index, previous).some((entry) => entry.person.id === id)) current.push(id);
    else {
      blocks.push(current);
      current = [id];
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function placeBlock(ids: string[], x: number, generation: number, positions: Record<string, LayoutPoint>): number {
  let cursor = x;
  for (const id of ids) {
    positions[id] = { x: cursor, y: generation * (PERSON_HEIGHT + ROW_GAP), width: PERSON_WIDTH, height: PERSON_HEIGHT };
    cursor += PERSON_WIDTH + SPOUSE_GAP;
  }
  return ids.length > 0 ? cursor - SPOUSE_GAP : x;
}

function blockWidth(ids: string[]): number {
  if (ids.length === 0) return 0;
  return ids.length * PERSON_WIDTH + (ids.length - 1) * SPOUSE_GAP;
}

function hintX(ids: string[], hint: Record<string, LayoutPoint>): number {
  const values = ids.flatMap((id) => (hint[id] ? [hint[id].x] : []));
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...values);
}

function centerOf(point: LayoutPoint): number {
  return point.x + point.width / 2;
}

function kindLabel(kind: string): string {
  if (kind === "adoptive") return "Adoptive";
  if (kind === "step") return "Step";
  if (kind === "foster") return "Foster";
  return "Parent";
}
