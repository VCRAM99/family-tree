"use client";

import { MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type Edge, type Node } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "@xyflow/react/dist/style.css";

import { CanvasContext, type CanvasChrome, type CanvasLod } from "@/components/tree/canvas-context";
import { Tooltip } from "@/components/tooltip";
import type { AddRole } from "@/components/tree/family-column";
import { FocusChrome } from "@/components/tree/focus-chrome";
import { JunctionNode, PersonNode } from "@/components/tree/person-node";
import { KinEdge } from "@/components/tree/kin-edge";
import { useTreeState } from "@/components/tree/tree-store-provider";
import { useTreeLayout } from "@/components/tree/use-tree-layout";
import type { PersonField } from "@/lib/domain";
import { focusTargets } from "@/lib/focus-nav";
import { isJunctionId, PERSON_HEIGHT, PERSON_WIDTH } from "@/lib/layout";

const nodeTypes = { person: PersonNode, junction: JunctionNode };
const edgeTypes = { kin: KinEdge };

export function TreeCanvas({
  personId,
  focused,
  editing,
  photosEnabled,
  visibleFields,
  viewerId,
  matches,
  onFocus,
  onOpen,
  onAdd,
  onExitFocus,
}: {
  personId: string | null;
  focused: boolean;
  editing: boolean;
  photosEnabled: boolean;
  visibleFields: PersonField[];
  viewerId: string | null;
  matches: Set<string> | null;
  onFocus: (personId: string) => void;
  onOpen: (personId: string) => void;
  onAdd: (role: AddRole, personId: string) => void;
  onExitFocus: () => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasSurface
        personId={personId}
        focused={focused}
        editing={editing}
        photosEnabled={photosEnabled}
        visibleFields={visibleFields}
        viewerId={viewerId}
        matches={matches}
        onFocus={onFocus}
        onOpen={onOpen}
        onAdd={onAdd}
        onExitFocus={onExitFocus}
      />
    </ReactFlowProvider>
  );
}

function CanvasSurface(props: {
  personId: string | null;
  focused: boolean;
  editing: boolean;
  photosEnabled: boolean;
  visibleFields: PersonField[];
  viewerId: string | null;
  matches: Set<string> | null;
  onFocus: (personId: string) => void;
  onOpen: (personId: string) => void;
  onAdd: (role: AddRole, personId: string) => void;
  onExitFocus: () => void;
}) {
  const graph = useTreeState((state) => state.graph);
  const index = useTreeState((state) => state.index);
  const layout = useTreeLayout(graph);
  const { zoom } = useViewport();
  const lod: CanvasLod = zoom < 0.28 ? "dot" : zoom < 0.55 ? "name" : "full";
  const [showMap, setShowMap] = useState(false);
  const flow = useReactFlow();
  const fitted = useRef(false);

  const neighbors = useMemo(() => {
    if (!props.focused || !props.personId) return new Set<string>();
    const targets = focusTargets(index, props.personId);
    const ids = new Set<string>([props.personId]);
    if (targets.father) ids.add(targets.father.id);
    if (targets.mother) ids.add(targets.mother.id);
    for (const person of targets.otherParents) ids.add(person.id);
    for (const entry of targets.spouses) ids.add(entry.person.id);
    if (targets.previousSibling) ids.add(targets.previousSibling.id);
    if (targets.nextSibling) ids.add(targets.nextSibling.id);
    for (const group of targets.childGroups) {
      for (const child of group.children) ids.add(child.id);
    }
    return ids;
  }, [index, props.focused, props.personId]);

  const nodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return Object.entries(layout.positions).flatMap(([id, point]) => {
      if (isJunctionId(id)) return [];
      const hidden = index.personById.get(id)?.isPlaceholder;
      return [
        {
          id,
          type: "person",
          position: { x: point.x, y: point.y },
          data: {},
          draggable: false,
          selectable: false,
          width: hidden ? 1 : PERSON_WIDTH,
          height: hidden ? 1 : PERSON_HEIGHT,
          style: hidden ? { width: 1, height: 1 } : { width: PERSON_WIDTH, height: PERSON_HEIGHT },
        },
      ];
    });
  }, [index, layout]);

  const edges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    return layout.edges
      .filter((edge) => layout.positions[edge.source] && layout.positions[edge.target])
      .map((edge) => {
        const mine = Boolean(props.focused && props.personId && (edge.source === props.personId || edge.target === props.personId));
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "kin",
          data: { ...edge, emphasized: mine, quiet: Boolean(props.focused && props.personId && !mine) },
        };
      });
  }, [layout, props.focused, props.personId]);

  useEffect(() => {
    if (!layout || fitted.current) return;
    fitted.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void flow.fitView({ padding: 0.18, duration: reduce ? 0 : 400 });
  }, [flow, layout]);

  useEffect(() => {
    if (!props.focused || !props.personId || !layout) return;
    const point = layout.positions[props.personId];
    if (!point) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void flow.setCenter(point.x + point.width / 2, point.y + point.height / 2, { zoom: 1.05, duration: reduce ? 0 : 600 });
  }, [flow, layout, props.focused, props.personId]);


  const chrome = useMemo<CanvasChrome>(
    () => ({
      lod,
      personId: props.personId,
      focusId: props.focused ? props.personId : null,
      neighbors,
      matches: props.matches,
      editing: props.editing,
      photosEnabled: props.photosEnabled,
      visibleFields: props.visibleFields,
      viewerId: props.viewerId,
      onOpen: props.onOpen,
      onFocus: props.onFocus,
      onAdd: props.onAdd,
    }),
    [lod, neighbors, props],
  );

  return (
    <CanvasContext.Provider value={chrome}>
      <div className="relative min-h-0 flex-1">
        {layout ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onlyRenderVisibleElements
            proOptions={{ hideAttribution: true }}
            minZoom={0.08}
            maxZoom={1.75}
            panOnScroll
            zoomOnPinch
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onPaneClick={() => props.onExitFocus()}
            onNodeClick={(_, node) => {
              if (!isJunctionId(node.id)) props.onFocus(node.id);
            }}
          >
            {showMap ? (
              <MiniMap
                pannable
                zoomable
                ariaLabel="Tree map"
                position="bottom-left"
                bgColor="var(--surface)"
                maskColor="color-mix(in srgb, var(--text) 18%, transparent)"
                nodeColor="var(--accent)"
                nodeStrokeWidth={0}
                style={{ width: 168, height: 112, marginBottom: 64, marginLeft: 12 }}
              />
            ) : null}
          </ReactFlow>
        ) : (
          <LayoutSkeleton />
        )}
        {props.focused && props.personId ? (
          <FocusChrome personId={props.personId} index={index} positions={layout?.positions} editing={props.editing} onNavigate={props.onFocus} onAdd={props.onAdd} />
        ) : null}
        <div className="canvas-controls absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex flex-row items-center overflow-hidden rounded-full border border-border bg-surface/95 shadow-sm">
          <CanvasButton tooltip="Zoom in" onClick={() => void flow.zoomIn({ duration: 180 })}>
            +
          </CanvasButton>
          <CanvasButton tooltip="Zoom out" onClick={() => void flow.zoomOut({ duration: 180 })}>
            −
          </CanvasButton>
          <CanvasButton tooltip="Fit to view" onClick={() => void flow.fitView({ padding: 0.18, duration: 400 })}>
            <FitIcon />
          </CanvasButton>
          <CanvasButton
            tooltip={props.viewerId ? "Center on me" : "Mark someone as you from their card"}
            disabled={!props.viewerId}
            onClick={() => props.viewerId && props.onFocus(props.viewerId)}
          >
            <MeIcon />
          </CanvasButton>
          <CanvasButton tooltip={showMap ? "Hide the minimap" : "Show the minimap"} pressed={showMap} onClick={() => setShowMap((value) => !value)}>
            <MapIcon />
          </CanvasButton>
        </div>
      </div>
    </CanvasContext.Provider>
  );
}

function LayoutSkeleton() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true">
      <p className="sr-only">Arranging the tree</p>
      <div className="flex flex-col items-center gap-8">
        <div className="flex gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-16 w-28 animate-pulse rounded-2xl border border-border bg-surface">
      <div className="m-3 h-2 w-16 rounded-full bg-border" />
      <div className="mx-3 h-2 w-10 rounded-full bg-border" />
    </div>
  );
}

function CanvasButton({
  tooltip,
  pressed = false,
  disabled = false,
  onClick,
  children,
}: {
  tooltip: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        aria-label={tooltip}
        aria-pressed={pressed}
        disabled={disabled}
        className={`inline-flex h-10 w-10 items-center justify-center text-base text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:opacity-40 ${pressed ? "bg-background" : ""}`}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function FitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6 V3 H6 M10 3 H13 V6 M13 10 V13 H10 M6 13 H3 V10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 13.5 c.6-2.6 2.2-3.8 4.5-3.8 s3.9 1.2 4.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4 L6 2.5 L10 4 L14 2.5 V12 L10 13.5 L6 12 L2 13.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 2.5 V12 M10 4 V13.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

