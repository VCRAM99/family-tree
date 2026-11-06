"use client";

import { useState } from "react";

import { Button } from "@/components/button";
import type { AddRole } from "@/components/tree/family-column";
import { preferredDisplayName, type GraphIndex, type GraphPerson } from "@/lib/family-graph";
import { directionBetween, focusTargets, type FocusTargets, type ScreenDirection } from "@/lib/focus-nav";
import type { LayoutPoint } from "@/lib/layout";

type ArrowKind = "father" | "mother" | "parent" | "child" | "sibling" | "spouse";

type ArrowItem = {
  id: string;
  tooltip: string;
  kind: ArrowKind;
  label: string;
};

const directionClass: Record<ScreenDirection, string> = {
  up: "top-3 left-1/2 -translate-x-1/2",
  down: "bottom-3 left-1/2 -translate-x-1/2 flex-col",
  left: "top-1/2 left-3 -translate-y-1/2 flex-col",
  right: "top-1/2 right-3 -translate-y-1/2 flex-col",
};

const glyph: Record<ScreenDirection, string> = { up: "↑", down: "↓", left: "←", right: "→" };

export function FocusChrome({
  personId,
  index,
  positions,
  editing,
  onNavigate,
  onAdd,
}: {
  personId: string;
  index: GraphIndex;
  positions?: Record<string, LayoutPoint>;
  editing: boolean;
  onNavigate: (personId: string) => void;
  onAdd: (role: AddRole, personId: string) => void;
}) {
  const targets = focusTargets(index, personId);
  const [picker, setPicker] = useState<ScreenDirection | null>(null);
  const [pickerFor, setPickerFor] = useState(personId);
  if (pickerFor !== personId) {
    setPickerFor(personId);
    setPicker(null);
  }
  const focus = positions?.[personId];
  const groups: Record<ScreenDirection, ArrowItem[]> = { up: [], down: [], left: [], right: [] };
  for (const item of arrowItems(targets)) {
    const box = positions?.[item.id];
    const direction = focus && box ? directionBetween(focus, box) : fallbackDirection(item.kind);
    groups[direction].push(item);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {(Object.keys(groups) as ScreenDirection[]).map((direction) => (
        <div key={direction} className={`pointer-events-auto absolute flex gap-2 ${directionClass[direction]}`}>
          {picker === direction ? <ArrowPicker items={groups[direction]} onNavigate={onNavigate} /> : null}
          <DirectionControl
            direction={direction}
            items={groups[direction]}
            onNavigate={onNavigate}
            onPicker={() => setPicker((value) => (value === direction ? null : direction))}
          />
        </div>
      ))}
      {editing && targets.missing.father ? <AddMark tooltip="Add a father" className="top-3 left-[calc(50%-3.5rem)] text-father" onAdd={() => onAdd("father", personId)} /> : null}
      {editing && targets.missing.mother ? <AddMark tooltip="Add a mother" className="top-3 left-[calc(50%+1.5rem)] text-mother" onAdd={() => onAdd("mother", personId)} /> : null}
      {editing && targets.missing.sibling && groups.left.length === 0 ? <AddMark tooltip="Add a sibling" className="top-1/2 left-3" onAdd={() => onAdd("sibling", personId)} /> : null}
      {editing && targets.missing.spouse && groups.right.length === 0 ? <AddMark tooltip="Add a spouse" className="top-1/2 right-3" onAdd={() => onAdd("spouse", personId)} /> : null}
      {editing && targets.missing.child && groups.down.length === 0 ? <AddMark tooltip="Add a child" className="bottom-3 left-1/2" onAdd={() => onAdd("child", personId)} /> : null}
    </div>
  );
}

function arrowItems(targets: FocusTargets): ArrowItem[] {
  const items: ArrowItem[] = [];
  for (const slot of targets.parentSlots) {
    if (!slot) continue;
    const label = slot.role === "mother" ? "Mother" : slot.role === "parent" ? "Parent" : "Father";
    items.push({ id: slot.person.id, kind: slot.role, label: preferredDisplayName(slot.person), tooltip: `${label} — ${preferredDisplayName(slot.person)}` });
  }
  for (const person of targets.otherParents) {
    items.push({ id: person.id, kind: "parent", label: preferredDisplayName(person), tooltip: `Parent — ${preferredDisplayName(person)}` });
  }
  if (targets.previousSibling) items.push(relativeItem(targets.previousSibling, "sibling", "Sibling"));
  if (targets.nextSibling && targets.nextSibling.id !== targets.previousSibling?.id) items.push(relativeItem(targets.nextSibling, "sibling", "Sibling"));
  for (const entry of targets.spouses) items.push(relativeItem(entry.person, "spouse", "Spouse"));
  for (const group of targets.childGroups) {
    for (const child of group.children) items.push(relativeItem(child, "child", "Child"));
  }
  return items;
}

function relativeItem(person: GraphPerson, kind: ArrowKind, title: string): ArrowItem {
  const name = preferredDisplayName(person);
  return { id: person.id, kind, label: name, tooltip: `${title} — ${name}` };
}

function fallbackDirection(kind: ArrowKind): ScreenDirection {
  if (kind === "father" || kind === "mother" || kind === "parent") return "up";
  if (kind === "child") return "down";
  if (kind === "sibling") return "left";
  return "right";
}

function DirectionControl({
  direction,
  items,
  onNavigate,
  onPicker,
}: {
  direction: ScreenDirection;
  items: ArrowItem[];
  onNavigate: (personId: string) => void;
  onPicker: () => void;
}) {
  if (items.length === 0) return null;
  const first = items[0];
  if (!first) return null;
  if (items.length > 1) {
    return (
      <Button tooltip="Choose a relative" variant="secondary" className="h-12 px-4 sm:h-11" onClick={onPicker}>
        {glyph[direction]}
      </Button>
    );
  }
  const spouse = first.kind === "spouse";
  const color = first.kind === "mother" ? "text-mother" : first.kind === "father" ? "text-father" : "";
  return (
    <Button tooltip={first.tooltip} variant="secondary" className={`relative h-12 px-4 sm:h-11 ${color}`} onClick={() => onNavigate(first.id)}>
      {glyph[direction]}
      {spouse ? <span className="absolute -top-1 -right-1 text-xs">♥</span> : null}
    </Button>
  );
}

function ArrowPicker({ items, onNavigate }: { items: ArrowItem[]; onNavigate: (personId: string) => void }) {
  return (
    <div className="flex max-w-[90vw] flex-col gap-2 rounded-3xl border border-border bg-surface p-3">
      {items.map((item) => (
        <Button key={`${item.kind}-${item.id}`} tooltip={item.tooltip} variant="secondary" onClick={() => onNavigate(item.id)}>
          {item.kind === "spouse" ? `♥ ${item.label}` : item.label}
        </Button>
      ))}
    </div>
  );
}

function AddMark({ tooltip, className, onAdd }: { tooltip: string; className: string; onAdd: () => void }) {
  return (
    <div className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 ${className}`}>
      <Button tooltip={tooltip} variant="add" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={onAdd}>
        +
      </Button>
    </div>
  );
}
