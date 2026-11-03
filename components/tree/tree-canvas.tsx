"use client";

import { MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type Edge, type Node } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/button";
import { CanvasContext, type CanvasChrome, type CanvasLod } from "@/components/tree/canvas-context";
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!props.focused || !props.personId) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (document.querySelector("[role=dialog]")) return;
      const targets = focusTargets(index, props.personId);
      const go = (id: string | undefined) => {
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        props.onFocus(id);
      };
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        props.onExitFocus();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        props.onOpen(props.personId);
        return;
      }
      if (event.key === "ArrowUp") {
        const [left, right] = targets.parentSlots;
        go(event.shiftKey ? right?.person.id ?? left?.person.id : left?.person.id ?? right?.person.id);
      } else if (event.key === "ArrowDown") {
        const children = targets.childGroups.flatMap((group) => group.children);
        if (children.length === 1) go(children[0]?.id);
      } else if (event.key === "ArrowLeft") {
        go(targets.previousSibling?.id);
      } else if (event.key === "ArrowRight") {
        go(targets.nextSibling?.id);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, props]);

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
            minZoom={0.08}
            maxZoom={1.75}
            panOnScroll
            zoomOnPinch
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onNodeClick={(_, node) => {
              if (!isJunctionId(node.id)) props.onFocus(node.id);
            }}
          >
            {showMap ? <MiniMap pannable zoomable /> : null}
          </ReactFlow>
        ) : (
          <p className="p-8 text-muted">Arranging the tree…</p>
        )}
        {props.focused && props.personId ? (
          <FocusChrome personId={props.personId} index={index} editing={props.editing} onNavigate={props.onFocus} onAdd={props.onAdd} />
        ) : null}
        <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex max-h-[calc(100%-1.5rem)] flex-row items-center gap-0.5 overflow-auto rounded-full border border-border bg-surface/95 p-1 shadow-sm [@media(max-width:240px)]:flex-col">
          <Button tooltip="Zoom in" variant="ghost" className="h-9 w-9 px-0" onClick={() => void flow.zoomIn({ duration: 180 })}>
            +
          </Button>
          <Button tooltip="Zoom out" variant="ghost" className="h-9 w-9 px-0" onClick={() => void flow.zoomOut({ duration: 180 })}>
            −
          </Button>
          <Button tooltip="Fit to view" variant="ghost" className="h-9 w-9 px-0" onClick={() => void flow.fitView({ padding: 0.18, duration: 400 })}>
            <FitIcon />
          </Button>
          <Button
            tooltip={props.viewerId ? "Center on me" : "Mark someone as you from their card"}
            variant="ghost"
            className="h-9 w-9 px-0"
            disabled={!props.viewerId}
            onClick={() => props.viewerId && props.onFocus(props.viewerId)}
          >
            <MeIcon />
          </Button>
          <Button tooltip={showMap ? "Hide the minimap" : "Show the minimap"} variant="ghost" className="h-9 w-9 px-0" onClick={() => setShowMap((value) => !value)}>
            <MapIcon />
          </Button>
        </div>
      </div>
    </CanvasContext.Provider>
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
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4 L6 2.5 L10 4 L14 2.5 V12 L10 13.5 L6 12 L2 13.5 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

