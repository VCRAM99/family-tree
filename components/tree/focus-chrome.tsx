"use client";

import { useState } from "react";

import { Button } from "@/components/button";
import type { AddRole } from "@/components/tree/family-column";
import { preferredDisplayName, type GraphIndex, type GraphPerson } from "@/lib/family-graph";
import { focusTargets, type FocusTargets } from "@/lib/focus-nav";

export function FocusChrome({
  personId,
  index,
  editing,
  onNavigate,
  onAdd,
}: {
  personId: string;
  index: GraphIndex;
  editing: boolean;
  onNavigate: (personId: string) => void;
  onAdd: (role: AddRole, personId: string) => void;
}) {
  const targets = focusTargets(index, personId);
  const [picker, setPicker] = useState<"children" | "spouses" | null>(null);
  const [pickerFor, setPickerFor] = useState(personId);
  if (pickerFor !== personId) {
    setPickerFor(personId);
    setPicker(null);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute top-3 left-1/2 flex -translate-x-1/2 gap-2">
        {targets.parentSlots.map((slot, index) => (
          <RelativeSlot
            key={slot?.person.id ?? (index === 0 ? "father-slot" : "mother-slot")}
            label={slot?.role === "mother" ? "Mother" : slot?.role === "parent" ? "Parent" : "Father"}
            person={slot?.person ?? null}
            missing={index === 0 ? targets.missing.father : targets.missing.mother}
            editing={editing}
            addTooltip={index === 0 ? "Add a father" : "Add a mother"}
            onOpen={onNavigate}
            onAdd={() => onAdd(index === 0 ? "father" : "mother", personId)}
          />
        ))}
        {targets.otherParents.map((person) => (
          <Button key={person.id} tooltip={`Parent — ${preferredDisplayName(person)}`} variant="secondary" className="h-12 px-4 sm:h-11" onClick={() => onNavigate(person.id)}>
            ↑
          </Button>
        ))}
      </div>

      <div className="pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2">
        {targets.previousSibling ? (
          <Button tooltip={`Older sibling — ${preferredDisplayName(targets.previousSibling)}`} variant="secondary" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={() => onNavigate(targets.previousSibling!.id)}>
            ←
          </Button>
        ) : (
          <SiblingAdd editing={editing} onAdd={() => onAdd("sibling", personId)} />
        )}
      </div>

      <div className="pointer-events-auto absolute top-1/2 right-3 -translate-y-1/2">
        {targets.nextSibling ? (
          <Button tooltip={`Younger sibling — ${preferredDisplayName(targets.nextSibling)}`} variant="secondary" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={() => onNavigate(targets.nextSibling!.id)}>
            →
          </Button>
        ) : (
          <SiblingAdd editing={editing} onAdd={() => onAdd("sibling", personId)} />
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        {picker === "children" ? <ChildPicker targets={targets} onNavigate={onNavigate} /> : null}
        <ChildSlot targets={targets} editing={editing} onNavigate={onNavigate} onAdd={() => onAdd("child", personId)} onPicker={() => setPicker((value) => (value === "children" ? null : "children"))} />
      </div>

      <div className="pointer-events-auto absolute right-3 bottom-24">
        {picker === "spouses" ? (
          <div className="mb-2 flex flex-col gap-2 rounded-3xl border border-border bg-surface p-3">
            {targets.spouses.map((entry) => (
              <Button key={entry.union.id} tooltip={`Spouse — ${preferredDisplayName(entry.person)}`} variant="secondary" onClick={() => onNavigate(entry.person.id)}>
                {preferredDisplayName(entry.person)}
              </Button>
            ))}
          </div>
        ) : null}
        <SpouseSlot
          targets={targets}
          editing={editing}
          onNavigate={onNavigate}
          onAdd={() => onAdd("spouse", personId)}
          onPicker={() => setPicker((value) => (value === "spouses" ? null : "spouses"))}
        />
      </div>
    </div>
  );
}

function RelativeSlot({
  label,
  person,
  missing,
  editing,
  addTooltip,
  onOpen,
  onAdd,
}: {
  label: string;
  person: GraphPerson | null;
  missing: boolean;
  editing: boolean;
  addTooltip: string;
  onOpen: (personId: string) => void;
  onAdd: () => void;
}) {
  if (person) {
    return (
      <Button
        tooltip={`${label} — ${preferredDisplayName(person)}`}
        variant="secondary"
        className={`h-12 px-4 sm:h-11 ${label === "Mother" ? "text-mother" : label === "Parent" ? "text-muted" : "text-father"}`}
        onClick={() => onOpen(person.id)}
      >
        ↑
      </Button>
    );
  }
  if (!missing || !editing) return null;
  return (
    <Button tooltip={addTooltip} variant="add" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={onAdd}>
      +
    </Button>
  );
}

function SiblingAdd({ editing, onAdd }: { editing: boolean; onAdd: () => void }) {
  if (!editing) return null;
  return (
    <Button tooltip="Add a sibling" variant="add" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={onAdd}>
      +
    </Button>
  );
}

function ChildSlot({
  targets,
  editing,
  onNavigate,
  onAdd,
  onPicker,
}: {
  targets: FocusTargets;
  editing: boolean;
  onNavigate: (personId: string) => void;
  onAdd: () => void;
  onPicker: () => void;
}) {
  const children = targets.childGroups.flatMap((group) => group.children);
  if (children.length === 1 && children[0]) {
    return (
      <Button tooltip={`Child — ${preferredDisplayName(children[0])}`} variant="secondary" className="h-12 px-4 sm:h-11" onClick={() => onNavigate(children[0]!.id)}>
        ↓
      </Button>
    );
  }
  if (children.length > 1) {
    return (
      <Button tooltip="Choose a child" variant="secondary" className="h-12 px-4 sm:h-11" onClick={onPicker}>
        ↓
      </Button>
    );
  }
  if (!editing) return null;
  return (
    <Button tooltip="Add a child" variant="add" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={onAdd}>
      +
    </Button>
  );
}

function ChildPicker({ targets, onNavigate }: { targets: FocusTargets; onNavigate: (personId: string) => void }) {
  return (
    <div className="flex max-w-[90vw] gap-3 overflow-auto rounded-3xl border border-border bg-surface p-3">
      {targets.childGroups.map((group) => (
        <div key={group.union?.id ?? "unknown"} className="flex min-w-36 flex-col gap-2">
          <p className="text-xs text-muted">{group.otherParent ? `With ${preferredDisplayName(group.otherParent)}` : "Other parent unknown"}</p>
          {group.children.map((child) => (
            <Button key={child.id} tooltip={`Child — ${preferredDisplayName(child)}`} variant="secondary" onClick={() => onNavigate(child.id)}>
              {preferredDisplayName(child)}
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}

function SpouseSlot({
  targets,
  editing,
  onNavigate,
  onAdd,
  onPicker,
}: {
  targets: FocusTargets;
  editing: boolean;
  onNavigate: (personId: string) => void;
  onAdd: () => void;
  onPicker: () => void;
}) {
  if (targets.spouses.length === 1 && targets.spouses[0]) {
    const spouse = targets.spouses[0].person;
    return (
      <Button tooltip={`Spouse — ${preferredDisplayName(spouse)}`} variant="secondary" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={() => onNavigate(spouse.id)}>
        ♥
      </Button>
    );
  }
  if (targets.spouses.length > 1) {
    return (
      <Button tooltip="Choose a spouse" variant="secondary" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={onPicker}>
        ♥
      </Button>
    );
  }
  if (!editing) return null;
  return (
    <Button tooltip="Add a spouse" variant="add" className="h-12 w-12 px-0 sm:h-11 sm:w-11" onClick={onAdd}>
      +
    </Button>
  );
}
