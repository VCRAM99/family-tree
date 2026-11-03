import type { ParentKind, UnionStatus } from "@/lib/family-graph";

export const PERSON_WIDTH = 220;
export const PERSON_HEIGHT = 92;
export const JUNCTION_SIZE = 10;

export type LayoutPoint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutEdgeKind = "spouse" | "parent" | "child";

export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  kind: LayoutEdgeKind;
  unionStatus?: UnionStatus;
  parentKind?: ParentKind;
  tooltip?: string;
  /** Graph coordinates. When set, the canvas draws this path instead of a node-to-node diagonal. */
  points?: { x: number; y: number }[];
  /** Drawn pieces. A crossing splits the lower edge so the join is a gap, not a junction. */
  strokes?: { x: number; y: number }[][];
  /** Sibling bus this edge belongs to. Different families never share a lane. */
  familyId?: string;
  emphasized?: boolean;
  quiet?: boolean;
};

export type LayoutResult = {
  positions: Record<string, LayoutPoint>;
  edges: LayoutEdge[];
  generations: Record<string, number>;
};
