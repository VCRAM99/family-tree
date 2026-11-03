import type { ElkInput } from "./model";
import type { LayoutEdge, LayoutPoint, LayoutResult } from "./types";

const GAP = 48;

/** Layered coordinates for graphs that are too large for elkjs on the UI path. Order and partitions come from the same model ELK uses. */
export function placeDirect(input: ElkInput, edges: LayoutEdge[], generations: Record<string, number>): LayoutResult {
  const layers = new Map<number, { id: string; width: number; height: number }[]>();
  for (const node of input.children) {
    const partition = Number(node.layoutOptions["elk.partitioning.partition"] ?? 0);
    const row = layers.get(partition) ?? [];
    row.push({ id: node.id, width: node.width, height: node.height });
    layers.set(partition, row);
  }

  const incoming = new Map<string, string[]>();
  for (const edge of input.edges) {
    const source = edge.sources[0];
    const target = edge.targets[0];
    if (!source || !target) continue;
    const list = incoming.get(target) ?? [];
    list.push(source);
    incoming.set(target, list);
  }

  const positions: Record<string, LayoutPoint> = {};
  const partitions = [...layers.keys()].sort((a, b) => a - b);
  for (const partition of partitions) {
    const row = layers.get(partition) ?? [];
    const desired = row.map((node) => {
      const sources = incoming.get(node.id) ?? [];
      if (sources.length === 0) return null;
      const centers = sources.flatMap((id) => {
        const point = positions[id];
        return point ? [point.x + point.width / 2] : [];
      });
      if (centers.length === 0) return null;
      return centers.reduce((sum, value) => sum + value, 0) / centers.length;
    });
    let cursor = 0;
    row.forEach((node, index) => {
      const want = desired[index];
      const x = want === null || want === undefined ? cursor : Math.max(cursor, want - node.width / 2);
      positions[node.id] = { x, y: partition * 120, width: node.width, height: node.height };
      cursor = x + node.width + GAP;
    });
  }

  return { positions, edges, generations };
}
