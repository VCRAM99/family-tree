"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { memo, useContext, useState } from "react";

import { Button } from "@/components/button";
import { CanvasContext } from "@/components/tree/canvas-context";
import { useTreeState } from "@/components/tree/tree-store-provider";
import { fullName, preferredDisplayName, type TreeGraph } from "@/lib/family-graph";
import { focusTargets } from "@/lib/focus-nav";
import { relationshipsBetween } from "@/lib/kinship";
import { cardYearLabel } from "@/lib/person-format";
import { nodeExtraLines } from "@/lib/tree-search";

function PersonNodeView({ id }: NodeProps) {
  const chrome = useContext(CanvasContext);
  const person = useTreeState((state) => state.index.personById.get(id));
  const index = useTreeState((state) => state.index);
  const graph = useTreeState((state) => state.graph);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  if (!person || !chrome) return null;

  const name = preferredDisplayName(person) || "Unnamed";
  const legalName = fullName(person) || name;
  const filteredOut = chrome.matches !== null && !chrome.matches.has(id);
  const aside = chrome.focusId !== null && !chrome.neighbors.has(id);
  const dimmed = filteredOut || aside;
  const opacity = filteredOut ? 0.18 : aside ? 0.42 : 1;
  const showAdd = chrome.editing && chrome.lod === "full" && !dimmed && (hovered || chrome.focusId === id || chrome.personId === id);
  const accent = person.sex === "male" ? "border-father" : person.sex === "female" ? "border-mother" : "border-border";
  const deceased = person.isDeceased || Boolean(person.deathDate);
  const chip = chipLabel(graph, chrome.viewerId, id);
  const years = cardYearLabel(person);
  const details = nodeExtraLines(person, chrome.visibleFields);
  const targets = focusTargets(index, id);
  const selected = chrome.focusId === id || chrome.personId === id;

  if (person.isPlaceholder) {
    return (
      <div className="h-px w-px opacity-0" aria-hidden>
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>
    );
  }

  if (chrome.lod === "dot") {
    return (
      <div className="relative h-3 w-3" style={{ opacity }}>
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
        <button type="button" title={name} aria-label={`Focus on ${name}`} onClick={() => chrome.onFocus(id)} className={`h-3 w-3 rounded-full border-2 ${accent} bg-surface`} />
      </div>
    );
  }

  return (
    <motion.div
      layoutId={chrome.personId === id ? `person-${id}` : undefined}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
      className={`person-card relative h-full w-full rounded-2xl border border-l-4 bg-surface px-3 py-2 text-left shadow-sm ${accent}`}
      tabIndex={0}
      aria-label={name}
      data-selected={selected ? "true" : "false"}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          chrome.onFocus(id);
        }
      }}
      style={{ opacity }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <div className="flex items-start gap-2">
        {chrome.lod === "full" && chrome.photosEnabled && person.hasPhoto ? (
          // Person photos are stored WebP blobs served with a cache-busting query.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${person.id}`} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1">
            <p className="truncate font-medium" title={legalName}>
              {name}
            </p>
            {deceased ? <span className="text-xs text-muted">†</span> : null}
          </div>
          {years ? (
            <p className="truncate text-xs text-muted" title={years}>
              {years}
            </p>
          ) : null}
          {chrome.lod === "full"
            ? details.map((line) => (
                <p key={line.key} className="truncate text-xs text-muted" title={line.text}>
                  {line.text}
                </p>
              ))
            : null}
          {chrome.lod === "full" && chip ? (
            <span className="mt-1 inline-block max-w-full truncate rounded-full bg-background px-2 py-0.5 text-[10px] tracking-[0.14em] text-muted uppercase">{chip}</span>
          ) : null}
        </div>
        <Button
          tooltip="Open card"
          variant="ghost"
          className="h-7 w-7 shrink-0 px-0"
          onClick={(event) => {
            event.stopPropagation();
            chrome.onOpen(id);
          }}
        >
          <OpenIcon />
        </Button>
      </div>
      {showAdd ? (
        <>
          {targets.missing.father ? <Plus tooltip="Add a father" className="-top-[11px] left-8 text-father" onAdd={() => chrome.onAdd("father", id)} /> : null}
          {targets.missing.mother ? <Plus tooltip="Add a mother" className="-top-[11px] right-3 text-mother" onAdd={() => chrome.onAdd("mother", id)} /> : null}
          {targets.missing.sibling ? <Plus tooltip="Add a sibling" className="top-1/2 -left-[11px]" onAdd={() => chrome.onAdd("sibling", id)} /> : null}
          {targets.missing.spouse ? <Plus tooltip="Add a spouse" className="top-1/2 -right-[11px]" onAdd={() => chrome.onAdd("spouse", id)} /> : null}
          {targets.missing.child ? <Plus tooltip="Add a child" className="left-1/2 -bottom-[11px]" onAdd={() => chrome.onAdd("child", id)} /> : null}
        </>
      ) : null}
    </motion.div>
  );
}

function Plus({ tooltip, className, onAdd }: { tooltip: string; className: string; onAdd: () => void }) {
  return (
    <span className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 ${className}`}>
      <Button
        tooltip={tooltip}
        variant="secondary"
        className="h-[22px] w-[22px] px-0 text-xs leading-none"
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
      >
        +
      </Button>
    </span>
  );
}

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M4 10 L10 4 M6 4 H10 V8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function chipLabel(graph: TreeGraph, viewerId: string | null, personId: string): string | null {
  if (!viewerId) return null;
  if (viewerId === personId) return "You";
  const term = relationshipsBetween(graph, viewerId, personId)[0]?.term;
  if (!term || term === "No known relation") return null;
  return term;
}

export const PersonNode = memo(PersonNodeView);

export function JunctionNode() {
  return (
    <div className="relative h-2.5 w-2.5 rounded-full bg-border">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
