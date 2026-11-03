"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/button";
import { useTreeState } from "@/components/tree/tree-store-provider";
import { Tooltip } from "@/components/tooltip";
import { childrenGrouped, parents, preferredDisplayName, siblings, spouses, type GraphPerson, type ParentKind, type UnionStatus } from "@/lib/family-graph";
import { formatLifeDate } from "@/lib/person-format";

export type AddRole = "father" | "mother" | "spouse" | "child" | "sibling";

export function FamilyColumn({
  personId,
  editing,
  seenLayout,
  onOpen,
  onAdd,
  onUnlinkParent,
  onUnlinkUnion,
  onKind,
  onUnionStatus,
  onUnionDates,
  onReorder,
}: {
  personId: string;
  editing: boolean;
  seenLayout: Set<string>;
  onOpen: (personId: string) => void;
  onAdd: (role: AddRole) => void;
  onUnlinkParent: (linkId: string) => void;
  onUnlinkUnion: (unionId: string) => void;
  onKind: (linkId: string, kind: ParentKind) => void;
  onUnionStatus: (unionId: string, status: UnionStatus) => void;
  onUnionDates: (unionId: string, patch: { startDate?: string | null; endDate?: string | null }) => void;
  onReorder: (unionId: string, direction: -1 | 1) => void;
}) {
  const index = useTreeState((state) => state.index);
  const parentPeople = parents(index, personId);
  const partnerList = spouses(index, personId);
  const siblingList = siblings(index, personId);
  const childGroups = childrenGrouped(index, personId);
  const hasFather = parentPeople.some((person) => person.sex === "male");
  const hasMother = parentPeople.some((person) => person.sex === "female");
  const parentLinks = index.parentsOf.get(personId) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <Section title="Parents">
        {parentPeople.map((person) => {
          const link = parentLinks.find((item) => item.parentId === person.id);
          return (
            <div key={person.id} className="flex flex-col gap-2">
              <PersonButton person={person} layout={layoutId(seenLayout, person.id)} onOpen={onOpen} accent={accent(person)} />
              {editing && link ? (
                <div className="flex flex-wrap items-center gap-2 pl-2">
                  <select
                    aria-label="Parent link kind"
                    value={link.kind}
                    className="h-9 rounded-full border border-border bg-surface px-3 text-xs"
                    onChange={(event) => onKind(link.id, event.target.value as ParentKind)}
                  >
                    <option value="biological">Biological</option>
                    <option value="adoptive">Adoptive</option>
                    <option value="step">Step</option>
                    <option value="foster">Foster</option>
                  </select>
                  <Button tooltip="Remove this relationship without deleting the person" variant="ghost" className="h-9 px-3" onClick={() => onUnlinkParent(link.id)}>
                    Unlink
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {editing && !hasFather ? (
          <Button tooltip="Add a father" variant="add" onClick={() => onAdd("father")}>
            + Father
          </Button>
        ) : null}
        {editing && !hasMother ? (
          <Button tooltip="Add a mother" variant="add" onClick={() => onAdd("mother")}>
            + Mother
          </Button>
        ) : null}
      </Section>

      <Section title="Spouses">
        {partnerList.map((entry, index) => (
          <div key={entry.union.id} className="flex flex-col gap-2">
            <PersonButton
              person={entry.person}
              layout={layoutId(seenLayout, entry.person.id)}
              onOpen={onOpen}
              detail={unionDetail(entry.union.status, entry.union.startDate, entry.union.endDate)}
            />
            {editing ? (
              <div className="flex flex-wrap items-center gap-2 pl-2">
                <select
                  aria-label="Union status"
                  value={entry.union.status}
                  className="h-9 rounded-full border border-border bg-surface px-3 text-xs"
                  onChange={(event) => onUnionStatus(entry.union.id, event.target.value as UnionStatus)}
                >
                  <option value="married">Married</option>
                  <option value="partner">Partner</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
                <Button tooltip="Move this spouse earlier" variant="ghost" className="h-9 px-3" disabled={index === 0} onClick={() => onReorder(entry.union.id, -1)}>
                  Up
                </Button>
                <Button
                  tooltip="Move this spouse later"
                  variant="ghost"
                  className="h-9 px-3"
                  disabled={index === partnerList.length - 1}
                  onClick={() => onReorder(entry.union.id, 1)}
                >
                  Down
                </Button>
                <label className="text-xs text-muted">
                  Started
                  <input
                    type="date"
                    aria-label="Union start"
                    value={entry.union.startDate ?? ""}
                    onChange={(event) => onUnionDates(entry.union.id, { startDate: event.target.value || null })}
                    className="ml-2 h-9 rounded-full border border-border bg-surface px-3 text-xs text-foreground"
                  />
                </label>
                <label className="text-xs text-muted">
                  Ended
                  <input
                    type="date"
                    aria-label="Union end"
                    value={entry.union.endDate ?? ""}
                    onChange={(event) => onUnionDates(entry.union.id, { endDate: event.target.value || null })}
                    className="ml-2 h-9 rounded-full border border-border bg-surface px-3 text-xs text-foreground"
                  />
                </label>
                <Button tooltip="Remove this relationship without deleting the person" variant="ghost" className="h-9 px-3" onClick={() => onUnlinkUnion(entry.union.id)}>
                  Unlink
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {editing ? (
          <Button tooltip="Add a spouse" variant="add" onClick={() => onAdd("spouse")}>
            + Add spouse
          </Button>
        ) : null}
      </Section>

      <Section title="Children">
        {childGroups.map((group) => (
          <div key={group.union?.id ?? "unknown"} className="flex flex-col gap-2">
            <p className="text-sm text-muted">{group.otherParent ? `With ${preferredDisplayName(group.otherParent)}` : "Other parent unknown"}</p>
            {group.children.map((child) => (
              <PersonButton key={child.id} person={child} layout={layoutId(seenLayout, child.id)} onOpen={onOpen} />
            ))}
          </div>
        ))}
        {editing ? (
          <Button tooltip="Add a child" variant="add" onClick={() => onAdd("child")}>
            + Add child
          </Button>
        ) : null}
      </Section>

      <Section title="Siblings">
        {siblingList.map((entry) => (
          <PersonButton
            key={entry.person.id}
            person={entry.person}
            layout={layoutId(seenLayout, entry.person.id)}
            onOpen={onOpen}
            detail={entry.half ? "Half" : undefined}
          />
        ))}
        {editing ? (
          <Button tooltip="Add a sibling" variant="add" onClick={() => onAdd("sibling")}>
            + Add sibling
          </Button>
        ) : null}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-3xl">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function layoutId(seen: Set<string>, personId: string): string | undefined {
  if (seen.has(personId)) return undefined;
  seen.add(personId);
  return `person-${personId}`;
}

function accent(person: GraphPerson): string {
  if (person.sex === "male") return "text-father";
  if (person.sex === "female") return "text-mother";
  return "";
}

function unionDetail(status: UnionStatus, start: string | null, end: string | null): string {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const dates = [formatLifeDate(start, start ? "exact" : null), formatLifeDate(end, end ? "exact" : null)].filter(Boolean).join(" – ");
  return dates ? `${label} · ${dates}` : label;
}

function PersonButton({
  person,
  layout,
  onOpen,
  detail,
  accent: accentClass = "",
}: {
  person: GraphPerson;
  layout?: string;
  onOpen: (personId: string) => void;
  detail?: string;
  accent?: string;
}) {
  const reduce = useReducedMotion();
  const name = preferredDisplayName(person);
  const dates = [formatLifeDate(person.birthDate, person.birthDatePrecision), formatLifeDate(person.deathDate, person.deathDatePrecision)]
    .filter(Boolean)
    .join(" – ");
  return (
    <Tooltip content={`Open ${name}`}>
      <motion.button
        type="button"
        layoutId={layout}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
        onClick={() => onOpen(person.id)}
        className="flex w-full items-baseline justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left"
      >
        <span className={`font-medium ${accentClass}`}>{name}</span>
        <span className="text-xs text-muted">{detail ?? dates}</span>
      </motion.button>
    </Tooltip>
  );
}
