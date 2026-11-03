import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs";

import { createGraphIndex, type TreeGraph } from "@/lib/family-graph";

import { arrangeFamilies } from "./arrange";
import { clarifyFamilyEdges } from "./clarify";
import { placeDirect } from "./direct";
import { assignGenerations, graphWithoutPlaceholders } from "./generations";
import { layoutHash } from "./hash";
import { buildElkGraph } from "./model";
import type { LayoutEdge, LayoutPoint, LayoutResult } from "./types";

const elk = new ELK();
const cache = new Map<string, LayoutResult>();
const CACHE_LIMIT = 8;

export function peekLayout(hash: string): LayoutResult | null {
  return cache.get(hash) ?? null;
}

export function clearLayoutCache(): void {
  cache.clear();
}

export async function computeLayout(graph: TreeGraph): Promise<LayoutResult> {
  const hash = layoutHash(graph);
  const cached = cache.get(hash);
  if (cached) return cached;

  const visible = graphWithoutPlaceholders(graph);
  const generations = assignGenerations(visible);
  const generationRecord: Record<string, number> = {};
  for (const [id, generation] of generations) generationRecord[id] = generation;

  if (visible.persons.length === 0) {
    const empty = finish(graph, { positions: {}, edges: [], generations: generationRecord });
    remember(hash, empty);
    return empty;
  }

  const { elk: input, edges } = buildElkGraph(visible, generations);
  const hint = visible.persons.length > 400 ? placeDirect(input, edges, generationRecord).positions : await elkPositions(input);
  const arranged = finish(graph, arrangeFamilies(visible, generations, hint));
  remember(hash, arranged);
  return arranged;
}

function finish(graph: TreeGraph, result: LayoutResult): LayoutResult {
  const placed = placePlaceholderJunctions(graph, result);
  return { ...placed, edges: clarifyFamilyEdges(placed.edges) };
}

function placePlaceholderJunctions(graph: TreeGraph, result: LayoutResult): LayoutResult {
  const placeholders = graph.persons.filter((person) => person.isPlaceholder);
  if (placeholders.length === 0) return result;
  const positions = { ...result.positions };
  const edges: LayoutEdge[] = [...result.edges];
  const index = createGraphIndex(graph);
  for (const placeholder of placeholders) {
    const childIds = (index.childrenOf.get(placeholder.id) ?? []).map((link) => link.childId).filter((id) => positions[id]);
    if (childIds.length === 0) continue;
    const centers = childIds.map((id) => {
      const point = positions[id];
      return point ? point.x + point.width / 2 : 0;
    });
    const minY = Math.min(...childIds.map((id) => positions[id]?.y ?? 0));
    const x = centers.reduce((sum, value) => sum + value, 0) / centers.length;
    const y = minY - 36;
    positions[placeholder.id] = { x, y, width: 1, height: 1 };
    const anchor = { x, y: y + 1 };
    const barY = y + 18;
    for (const childId of childIds) {
      const point = positions[childId];
      if (!point) continue;
      const childX = point.x + point.width / 2;
      edges.push({
        id: `bus-${placeholder.id}-${childId}`,
        source: placeholder.id,
        target: childId,
        kind: "child",
        familyId: placeholder.id,
        points: [anchor, { x: anchor.x, y: barY }, { x: childX, y: barY }, { x: childX, y: point.y }],
      });
    }
  }
  return { ...result, positions, edges };
}

async function elkPositions(input: ReturnType<typeof buildElkGraph>["elk"]): Promise<Record<string, LayoutPoint>> {
  const laidOut = await elk.layout({
    id: input.id,
    layoutOptions: input.layoutOptions,
    children: input.children.map(({ id, width, height, layoutOptions }) => ({ id, width, height, layoutOptions })),
    edges: input.edges,
  });
  const positions: Record<string, LayoutPoint> = {};
  for (const node of laidOut.children ?? []) {
    if (!node.id) continue;
    positions[node.id] = point(node);
  }
  return positions;
}

function point(node: ElkNode): LayoutPoint {
  return {
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

function remember(hash: string, result: LayoutResult) {
  cache.set(hash, result);
  if (cache.size <= CACHE_LIMIT) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}
