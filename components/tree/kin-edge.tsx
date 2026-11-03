"use client";

import { getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import type { LayoutEdge } from "@/lib/layout";

const CORNER = 8;

export function KinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const edge = data as LayoutEdge | undefined;
  const strokes = edge?.strokes?.filter((stroke) => stroke.length > 1);
  const paths = strokes && strokes.length > 0 ? strokes.map((stroke) => roundedPolyline(stroke, CORNER)) : [fallback()];
  const divorced = edge?.kind === "spouse" && edge.unionStatus === "divorced";
  const dotted = edge?.parentKind && edge.parentKind !== "biological";
  const stroke = edge?.emphasized ? "var(--accent)" : "var(--border)";
  return (
    <g style={{ opacity: edge?.quiet ? 0.28 : 1 }}>
      {paths.map((path, index) => (
        <g key={`${id}-${index}`}>
          <path d={path} fill="none" stroke="var(--background)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={divorced ? "7 5" : dotted ? "1.5 5" : undefined}
          />
        </g>
      ))}
      {edge?.tooltip ? <title>{edge.tooltip}</title> : null}
    </g>
  );

  function fallback() {
    if (edge?.points && edge.points.length > 1) return roundedPolyline(edge.points, CORNER);
    const [smooth] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: CORNER });
    return smooth;
  }
}

function roundedPolyline(points: { x: number; y: number }[], radius: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  if (points.length === 2) return `M ${first.x} ${first.y} L ${last.x} ${last.y}`;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || !next) continue;
    const inDistance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outDistance = Math.hypot(next.x - current.x, next.y - current.y);
    const cut = Math.min(radius, inDistance / 2, outDistance / 2);
    const arrive = pointOn(current, previous, cut);
    const leave = pointOn(current, next, cut);
    path += ` L ${arrive.x} ${arrive.y} Q ${current.x} ${current.y} ${leave.x} ${leave.y}`;
  }
  path += ` L ${last.x} ${last.y}`;
  return path;
}

function pointOn(from: { x: number; y: number }, toward: { x: number; y: number }, distance: number) {
  const length = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
  return { x: from.x + ((toward.x - from.x) / length) * distance, y: from.y + ((toward.y - from.y) / length) * distance };
}
