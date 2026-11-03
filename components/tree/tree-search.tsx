"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/button";
import { Tooltip } from "@/components/tooltip";
import type { Sex } from "@/lib/family-graph";
import { preferredDisplayName, type TreeGraph } from "@/lib/family-graph";
import { emptyFilters, filtersActive, searchPeople, type TreeFilters } from "@/lib/tree-search";

export function TreeSearch({
  graph,
  generations,
  filters,
  query,
  viewerId,
  onQuery,
  onFilters,
  onSelect,
}: {
  graph: TreeGraph;
  generations: Record<string, number>;
  filters: TreeFilters;
  query: string;
  viewerId: string | null;
  onQuery: (query: string) => void;
  onFilters: (filters: TreeFilters) => void;
  onSelect: (personId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const hits = useMemo(() => searchPeople(graph, generations, filters, query, viewerId), [filters, generations, graph, query, viewerId]);
  const decades = useMemo(() => {
    const values = new Set<number>();
    for (const person of graph.persons) {
      const year = Number(person.birthDate?.slice(0, 4));
      if (Number.isFinite(year)) values.add(Math.floor(year / 10) * 10);
    }
    return [...values].sort((a, b) => a - b);
  }, [graph.persons]);
  const generationOptions = useMemo(() => [...new Set(Object.values(generations))].sort((a, b) => a - b), [generations]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full sm:w-80">
      <input
        ref={input}
        value={query}
        placeholder="Search people"
        aria-label="Search people"
        aria-keyshortcuts="Meta+K Control+K"
        className="h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
        onChange={(event) => onQuery(event.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open ? (
      <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-auto rounded-t-3xl border border-border bg-surface p-4 shadow-lg sm:absolute sm:inset-auto sm:top-[calc(100%+8px)] sm:max-h-96 sm:w-full sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <Button tooltip="Filter by place, name, life, sex, decade, or generation" variant="ghost" onClick={() => setShowFilters((value) => !value)}>
            Filters
          </Button>
          <Button tooltip="Close search" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
        {showFilters ? (
          <div className="mt-3 grid gap-2">
            <Field label="Place" value={filters.location} onChange={(location) => onFilters({ ...filters, location })} />
            <Field label="Surname" value={filters.surname} onChange={(surname) => onFilters({ ...filters, surname })} />
            <label className="text-xs text-muted">
              Life
              <select aria-label="Living or deceased" className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-sm" value={filters.life} onChange={(event) => onFilters({ ...filters, life: event.target.value as TreeFilters["life"] })}>
                <option value="any">Anyone</option>
                <option value="living">Living</option>
                <option value="deceased">Deceased</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Sex
              <select aria-label="Sex" className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-sm" value={filters.sex} onChange={(event) => onFilters({ ...filters, sex: event.target.value as Sex | "any" })}>
                <option value="any">Any</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Birth decade from
              <select aria-label="Birth decade from" className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-sm" value={filters.decadeFrom ?? ""} onChange={(event) => onFilters({ ...filters, decadeFrom: event.target.value ? Number(event.target.value) : null })}>
                <option value="">Any</option>
                {decades.map((decade) => (
                  <option key={decade} value={decade}>
                    {decade}s
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Birth decade to
              <select aria-label="Birth decade to" className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-sm" value={filters.decadeTo ?? ""} onChange={(event) => onFilters({ ...filters, decadeTo: event.target.value ? Number(event.target.value) : null })}>
                <option value="">Any</option>
                {decades.map((decade) => (
                  <option key={decade} value={decade}>
                    {decade}s
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Generation
              <select aria-label="Generation" className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-sm" value={filters.generation ?? ""} onChange={(event) => onFilters({ ...filters, generation: event.target.value === "" ? null : Number(event.target.value) })}>
                <option value="">Any</option>
                {generationOptions.map((generation) => (
                  <option key={generation} value={generation}>
                    {generation}
                  </option>
                ))}
              </select>
            </label>
            {filtersActive(filters) ? (
              <Button tooltip="Clear filters" variant="ghost" onClick={() => onFilters(emptyFilters)}>
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
        <ul className="mt-3 flex flex-col gap-1">
          {hits.map((hit) => {
            const name = preferredDisplayName(hit.person);
            return (
              <li key={hit.person.id}>
                <Tooltip content={`Open ${name}`} className="w-full">
                  <button type="button" className="flex w-full items-baseline justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-background" onClick={() => onSelect(hit.person.id)}>
                    <span>{name}</span>
                    <span className="text-xs text-muted">{[hit.lifeYears, hit.relationship].filter(Boolean).join(" · ")}</span>
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-muted">
      {label}
      <input aria-label={label} value={value} className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-sm text-text" onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
