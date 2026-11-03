"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutGroup } from "motion/react";

import {
  createPersonAction,
  deletePersonAction,
  linkPeopleAction,
  reorderUnionsAction,
  setViewerAction,
  unlinkAction,
  updateParentLinkAction,
  updatePersonAction,
  updateUnionAction,
} from "@/app/tree/[id]/actions";
import { Button } from "@/components/button";
import { FamilyColumn, type AddRole } from "@/components/tree/family-column";
import { SuggestPanel } from "@/components/tree/suggest-panel";
import { PersonCard } from "@/components/tree/person-card";
import { TreeCanvas } from "@/components/tree/tree-canvas";
import { TreeSearch } from "@/components/tree/tree-search";
import { TreeStoreProvider, useTreeApi, useTreeState } from "@/components/tree/tree-store-provider";
import { Tooltip } from "@/components/tooltip";
import type { CustomFieldDef, PersonField } from "@/lib/domain";
import {
  createGraphIndex,
  defaultPersonId,
  formInstanceKey,
  preferredDisplayName,
  relationshipCount,
  siblings,
  spouses,
  type GraphPerson,
  type ParentKind,
  type Sex,
  type TreeGraph,
  type UnionStatus,
} from "@/lib/family-graph";
import { relationshipsBetween } from "@/lib/kinship";
import { assignGenerations } from "@/lib/layout";
import { emptyFilters, filtersActive, peopleMatching, type TreeFilters } from "@/lib/tree-search";
import { flushAutosaves, type AutosaveStatus } from "@/lib/autosave";
import { carriedDraftPatch, childUnionChoice, mergeSavedPerson, type LinkInput, type PersonPatch, type RelationInput } from "@/lib/person-edits";

export type TreeScreenData = {
  id: string;
  name: string;
  photosEnabled: boolean;
  socialsEnabled: boolean;
  customFieldDefs: CustomFieldDef[];
  canEdit: boolean;
  visibleFields: PersonField[];
  viewerPersonId: string | null;
  initialPersonId: string | null;
  graph: TreeGraph;
  /** Public and unlisted viewers. Hides edit controls and uses this path for person links. */
  basePath?: string;
  publicMode?: boolean;
  allowSuggestions?: boolean;
  signedIn?: boolean;
};

export function TreeExperience(props: TreeScreenData) {
  return (
    <TreeStoreProvider graph={props.graph}>
      <TreeScreen {...props} />
    </TreeStoreProvider>
  );
}

type Dialog =
  | { step: "choose" | "search"; role: AddRole | "root"; unionId: string | null; anchorId: string; alsoSiblings?: boolean; replacePlaceholder?: boolean }
  | { step: "union"; anchorId: string }
  | { step: "delete" }
  | null;

function TreeScreen(props: TreeScreenData) {
  const router = useRouter();
  const search = useSearchParams();
  const store = useTreeApi();
  const graph = useTreeState((state) => state.graph);
  const index = useTreeState((state) => state.index);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filters, setFilters] = useState<TreeFilters>(emptyFilters);
  const [finder, setFinder] = useState("");
  const [viewerId, setViewerId] = useState(props.viewerPersonId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [query, setQuery] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [relationError, setRelationError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AutosaveStatus>("idle");
  const statuses = useRef(new Map<string, AutosaveStatus>());
  const drafts = useRef(new Map<string, RelationInput>());
  const draftTouched = useRef(new Map<string, PersonPatch>());

  const basePath = props.basePath ?? `/tree/${props.id}`;
  const requested = search.get("person");
  const [chosenId, setChosenId] = useState<string | null>(requested);
  const personId =
    (chosenId && index.personById.has(chosenId) ? chosenId : null) ??
    (requested && index.personById.has(requested) ? requested : null) ??
    (props.initialPersonId && index.personById.has(props.initialPersonId) ? props.initialPersonId : null) ??
    defaultPersonId(graph, viewerId, null);
  const person = personId ? index.personById.get(personId) ?? null : null;
  const realCount = graph.persons.filter((item) => !item.pending && !item.isPlaceholder).length;

  const view = search.get("view") === "tree" ? "tree" : "card";

  useEffect(() => {
    if (search.get("person") || !personId) return;
    writePersonUrl(basePath, personId, view, "replace");
  }, [basePath, personId, props.id, search, view]);

  useEffect(() => {
    function onPop() {
      setChosenId(new URLSearchParams(window.location.search).get("person"));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [summaryPerson, setSummaryPerson] = useState(personId);
  if (personId !== summaryPerson) {
    setSummaryPerson(personId);
    setSummary("idle");
  }

  const openPerson = useCallback(
    (id: string) => {
      void (async () => {
        await flushAutosaves();
        const current = personId ? store.getState().index.personById.get(personId) : null;
        if (current?.pending && !current.firstName.trim() && id !== current.id) {
          store.getState().apply((draft) => {
            draft.persons = draft.persons.filter((item) => item.id !== current.id);
          });
          drafts.current.delete(current.id);
        }
        setChosenId(id);
        const nextView = new URLSearchParams(window.location.search).get("view") === "tree" ? "tree" : "card";
        writePersonUrl(basePath, id, nextView, "push");
      })();
    },
    [basePath, personId, store],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (dialog) {
        setDialog(null);
        return;
      }
      if (editing) setEditing(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, editing]);

  const reportStatus = useCallback((status: AutosaveStatus) => {
    statuses.current.set("field", status);
    setSummary(status);
  }, []);

  const relationships = useMemo(() => {
    if (!person || !viewerId || viewerId === person.id) return [];
    return relationshipsBetween(graph, viewerId, person.id);
  }, [graph, person, viewerId]);

  async function persist(current: GraphPerson, patch: PersonPatch) {
    const key = current.clientKey ?? current.id;
    store.getState().apply((draft) => {
      const target = findEditable(draft, current);
      if (!target) return;
      Object.assign(target, patch);
      if (patch.customFields) target.customFields = { ...target.customFields, ...patch.customFields };
    });
    const live = findEditable(store.getState().graph, current) ?? current;
    if (live.pending) {
      draftTouched.current.set(key, { ...(draftTouched.current.get(key) ?? {}), ...patch });
      const name = (patch.firstName ?? live.firstName).trim();
      if (!patch.firstName || !name) return;
      const relation = drafts.current.get(key) ?? drafts.current.get(current.id) ?? { kind: "root" };
      const result = await createPersonAction(props.id, { firstName: name, sex: live.sex, middleName: live.middleName, lastName: live.lastName }, relation);
      if ("error" in result) throw new Error(result.error);
      if (!("person" in result) || !result.person) throw new Error("Could not add that person.");
      const created = result.person;
      const currentPerson = findEditable(store.getState().graph, live) ?? live;
      const saved = mergeSavedPerson({ ...currentPerson, clientKey: key }, created, { firstName: name, sex: live.sex, middleName: live.middleName, lastName: live.lastName });
      store.getState().apply((draft) => {
        const slot = draft.persons.findIndex((item) => item.id === live.id || item.clientKey === key);
        if (slot >= 0) draft.persons[slot] = saved;
        else draft.persons.push(saved);
        absorbWrite(draft, result);
      });
      drafts.current.delete(key);
      drafts.current.delete(current.id);
      setChosenId(created.id);
      writePersonUrl(basePath, created.id, "card", "replace");
      const fresh = findEditable(store.getState().graph, saved) ?? saved;
      const extra = carriedDraftPatch(fresh, draftTouched.current.get(key) ?? {});
      draftTouched.current.delete(key);
      if (Object.keys(extra).length === 0) return;
      const updated = await updatePersonAction(props.id, created.id, extra);
      if (updated.person) {
        store.getState().apply((draft) => {
          const slot = draft.persons.findIndex((item) => item.id === created.id || item.clientKey === key);
          if (slot >= 0) draft.persons[slot] = mergeSavedPerson(draft.persons[slot] ?? saved, updated.person!, extra);
        });
      }
      return;
    }
    const result = await updatePersonAction(props.id, live.id, patch);
    if (result.error || !result.person) throw new Error(result.error ?? "Could not save.");
    store.getState().apply((draft) => {
      const slot = draft.persons.findIndex((item) => item.id === live.id || item.clientKey === key);
      if (slot >= 0 && draft.persons[slot]) draft.persons[slot] = mergeSavedPerson(draft.persons[slot], result.person!, patch);
    });
  }

  function startDraft(role: AddRole | "root", unionId: string | null, anchorId: string | null, alsoSiblings = true, replacePlaceholder = true) {
    const anchor = anchorId ?? person?.id ?? null;
    if (!anchor && role !== "root") return;
    const id = crypto.randomUUID();
    const sex: Sex = role === "father" ? "male" : role === "mother" ? "female" : "unknown";
    const blank = blankPerson(id, props.id, sex);
    const relation: RelationInput =
      role === "root"
        ? { kind: "root" }
        : role === "father" || role === "mother"
          ? { kind: role, childId: anchor!, alsoSiblings, replacePlaceholder }
          : role === "spouse"
            ? { kind: "spouse", personId: anchor! }
            : role === "child"
              ? { kind: "child", parentId: anchor!, unionId }
              : { kind: "sibling", personId: anchor! };
    drafts.current.set(id, relation);
    store.getState().apply((draft) => {
      draft.persons.push(blank);
    });
    setEditing(true);
    setDialog(null);
    setChosenId(id);
    writePersonUrl(basePath, id, "card", "push");
  }

  function beginAdd(role: AddRole, anchorId: string) {
    setDialogError(null);
    setQuery("");
    if (role === "child") {
      const choice = childUnionChoice(spouses(store.getState().index, anchorId).map((entry) => entry.union.id));
      if (choice.step === "union") setDialog({ step: "union", anchorId });
      else setDialog({ step: "choose", role, unionId: choice.unionId, anchorId, alsoSiblings: true, replacePlaceholder: true });
      return;
    }
    setDialog({ step: "choose", role, unionId: null, anchorId, alsoSiblings: true, replacePlaceholder: true });
  }

  async function linkExisting(otherId: string) {
    if (!dialog || dialog.step === "delete" || dialog.step === "union") return;
    const input = linkInput(dialog.role, dialog.anchorId, otherId, dialog.unionId, dialog.alsoSiblings !== false, dialog.replacePlaceholder !== false);
    if (!input) return;
    const previous = store.getState().graph;
    const result = await linkPeopleAction(props.id, input);
    if ("error" in result) {
      store.getState().rollback(previous);
      setDialogError(result.error);
      return;
    }
    store.getState().apply((draft) => {
      absorbWrite(draft, result);
    });
    setDialog(null);
    setDialogError(null);
  }

  async function toggleMe() {
    if (!person || person.pending) return;
    if (props.publicMode && !props.signedIn) {
      const next = `${basePath}?${new URLSearchParams(search.toString()).toString()}`;
      router.push(`/?next=${encodeURIComponent(next)}`);
      return;
    }
    const next = viewerId === person.id ? null : person.id;
    const previous = viewerId;
    setViewerId(next);
    const result = await setViewerAction(props.id, next);
    if (result.error) setViewerId(previous);
  }

  async function removePerson() {
    if (!person) return;
    const result = await deletePersonAction(props.id, person.id);
    if ("error" in result) {
      setDialogError(result.error);
      return;
    }
    store.getState().apply((draft) => {
      draft.persons = draft.persons.filter((item) => item.id !== person.id);
      draft.parentLinks = draft.parentLinks.filter((link) => link.parentId !== person.id && link.childId !== person.id);
      draft.unions = draft.unions.filter((union) => union.personAId !== person.id && union.personBId !== person.id);
    });
    setDialog(null);
    if (viewerId === person.id) setViewerId(null);
    if (result.nextPersonId) openPerson(result.nextPersonId);
  }

  const seen = new Set<string>();
  if (person) seen.add(person.id);

  const matches = graph.persons.filter((item) => {
    if (item.pending || item.isPlaceholder || item.id === person?.id) return false;
    const haystack = `${item.firstName} ${item.preferredName ?? ""} ${item.lastName ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const generations = useMemo(() => {
    const assigned = assignGenerations(graph);
    return Object.fromEntries(assigned);
  }, [graph]);
  const matchIds = useMemo(() => {
    if (!filtersActive(filters)) return null;
    return new Set(peopleMatching(graph, generations, filters).map((item) => item.id));
  }, [filters, generations, graph]);

  return (
    <main className={view === "tree" ? "flex h-full min-h-0 flex-col px-3 sm:px-4" : "mx-auto w-full max-w-6xl px-4 pb-24 sm:px-8"}>
      <header className="flex shrink-0 flex-col gap-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted uppercase">Tree</p>
          <h1 className="font-display text-4xl tracking-tight">{props.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TreeSearch
            graph={graph}
            generations={generations}
            filters={filters}
            query={finder}
            viewerId={viewerId}
            onQuery={setFinder}
            onFilters={setFilters}
            onSelect={(id) => {
              if (view === "tree") setFocused(true);
              openPerson(id);
            }}
          />
          <p className="min-w-16 text-sm text-muted" aria-live="polite">
            {summary === "saving" ? "Saving…" : summary === "saved" ? "Saved" : summary === "retry" ? "Retry" : ""}
          </p>
          <Button
            tooltip={view === "tree" ? "Show the card" : "Show the tree diagram"}
            variant={view === "tree" ? "primary" : "secondary"}
            onClick={() => {
              const params = new URLSearchParams(search.toString());
              params.set("view", view === "tree" ? "card" : "tree");
              if (personId) params.set("person", personId);
              router.push(`${basePath}?${params.toString()}`, { scroll: false });
            }}
          >
            {view === "tree" ? "Card" : "Tree view"}
          </Button>
          {props.canEdit ? (
            <Tooltip content="Open sharing, fields, and theme" side="bottom">
              <Link href={`/tree/${props.id}/settings`} className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
                Settings
              </Link>
            </Tooltip>
          ) : null}
          {props.canEdit ? (
            <Button tooltip={editing ? "Leave edit mode" : "Edit people in this tree"} variant={editing ? "primary" : "secondary"} onClick={() => setEditing((value) => !value)}>
              {editing ? "View" : "Edit"}
            </Button>
          ) : null}
        </div>
      </header>

      {realCount === 0 && !person?.pending ? (
        <section className="mx-auto mt-16 max-w-lg text-center">
          <p className="font-display text-5xl tracking-tight">This tree is waiting for someone.</p>
          <p className="mt-4 text-lg leading-relaxed text-muted">Add the first person. Everyone else can be linked to them, even when one life touches the tree in more than one place.</p>
          {props.canEdit ? (
            <Button tooltip="Add the first person" className="mt-8" onClick={() => startDraft("root", null, null)}>
              Add someone
            </Button>
          ) : null}
        </section>
      ) : view === "tree" && person ? (
        <LayoutGroup>
          <TreeCanvas
            personId={person.id}
            focused={focused}
            editing={editing && props.canEdit}
            photosEnabled={props.photosEnabled}
            visibleFields={props.visibleFields}
            viewerId={viewerId}
            matches={matchIds}
            onFocus={(id) => {
              setFocused(true);
              openPerson(id);
            }}
            onOpen={(id) => {
              const params = new URLSearchParams(search.toString());
              params.set("view", "card");
              params.set("person", id);
              router.push(`${basePath}?${params.toString()}`, { scroll: false });
            }}
            onAdd={beginAdd}
            onExitFocus={() => setFocused(false)}
          />
        </LayoutGroup>
      ) : person ? (
        <LayoutGroup>
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PersonCard
              key={formInstanceKey(person)}
              person={person}
              editing={editing && props.canEdit}
              photosEnabled={props.photosEnabled}
              socialsEnabled={props.socialsEnabled}
              customFieldDefs={props.customFieldDefs}
              viewerPersonId={viewerId}
              relationships={relationships}
              focusLayout
              onPersist={(patch) => persist(person, patch)}
              onStatus={reportStatus}
              onToggleMe={() => void toggleMe()}
              onDelete={() => {
                setDialogError(null);
                setDialog({ step: "delete" });
              }}
              onPhoto={(hasPhoto) => {
                store.getState().apply((draft) => {
                  const target = draft.persons.find((item) => item.id === person.id);
                  if (target) target.hasPhoto = hasPhoto;
                });
              }}
            />
            <div className="flex flex-col gap-8">
            {relationError ? <p className="text-sm text-danger">{relationError}</p> : null}
            {props.publicMode && person && !person.pending ? (
              <SuggestPanel
                treeId={props.id}
                personId={person.id}
                allowSuggestions={Boolean(props.allowSuggestions)}
                socialsEnabled={props.socialsEnabled}
                signedIn={Boolean(props.signedIn)}
                returnPath={`${basePath}?${search.toString()}`}
              />
            ) : null}
            <FamilyColumn
              personId={person.id}
              editing={editing && props.canEdit && !person.pending}
              seenLayout={seen}
              onOpen={openPerson}
              onAdd={(role) => beginAdd(role, person.id)}
              onUnlinkParent={(linkId) => void unlink("parent", linkId)}
              onUnlinkUnion={(unionId) => void unlink("union", unionId)}
              onKind={(linkId, kind) => void changeKind(linkId, kind)}
              onUnionStatus={(unionId, status) => void changeStatus(unionId, status)}
              onUnionDates={(unionId, patch) => void changeDates(unionId, patch)}
              onReorder={(unionId, direction) => void reorder(unionId, direction)}
            />
            </div>
          </div>
        </LayoutGroup>
      ) : null}

      {dialog?.step === "union" ? (
        <Overlay title="Add a child" onClose={() => setDialog(null)}>
          <p className="text-sm text-muted">Whose child is this?</p>
          <div className="mt-4 flex flex-col gap-2">
            {spouses(index, dialog.anchorId).map((entry) => (
              <Button
                key={entry.union.id}
                tooltip={`Child with ${preferredDisplayName(entry.person)}`}
                variant="secondary"
                onClick={() => setDialog({ step: "choose", role: "child", unionId: entry.union.id, anchorId: dialog.anchorId })}
              >
                With {preferredDisplayName(entry.person)}
              </Button>
            ))}
            <Button tooltip="Leave the other parent unknown" variant="ghost" onClick={() => setDialog({ step: "choose", role: "child", unionId: null, anchorId: dialog.anchorId })}>
              Other parent unknown
            </Button>
          </div>
        </Overlay>
      ) : null}

      {dialog && (dialog.step === "choose" || dialog.step === "search") ? (
        <Overlay title={dialog.step === "choose" ? "Add a person" : "Link someone in this tree"} onClose={() => setDialog(null)}>
          {dialog.step === "choose" ? (
            <div className="flex flex-col gap-2">
              <SiblingOption dialog={dialog} index={index} onChange={(alsoSiblings) => setDialog({ ...dialog, alsoSiblings })} />
              <PlaceholderOption
                dialog={dialog}
                index={index}
                onChange={(replacePlaceholder) => setDialog({ ...dialog, replacePlaceholder })}
              />
              <Button
                tooltip="Create a new person and open their card"
                onClick={() => startDraft(dialog.role, dialog.unionId, dialog.anchorId, dialog.alsoSiblings !== false, dialog.replacePlaceholder !== false)}
              >
                Create new person
              </Button>
              <Button
                tooltip="Attach someone who is already in this tree"
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setDialog({ ...dialog, step: "search" });
                }}
              >
                Link existing person
              </Button>
            </div>
          ) : (
            <div>
              <input
                autoFocus
                value={query}
                placeholder="Search this tree"
                aria-label="Search this tree"
                className="h-12 w-full rounded-2xl border border-border bg-background px-4"
                onChange={(event) => setQuery(event.target.value)}
              />
              <ul className="mt-4 flex max-h-72 flex-col gap-2 overflow-auto">
                {matches.slice(0, 30).map((item) => (
                  <li key={item.id}>
                    <Button tooltip={`Link ${preferredDisplayName(item)}`} variant="secondary" className="w-full" onClick={() => void linkExisting(item.id)}>
                      {preferredDisplayName(item)}
                    </Button>
                  </li>
                ))}
              </ul>
              {dialogError ? <p className="mt-3 text-sm text-danger">{dialogError}</p> : null}
            </div>
          )}
        </Overlay>
      ) : null}

      {dialog?.step === "delete" && person ? (
        <Overlay title="Delete this person" onClose={() => setDialog(null)}>
          <p className="leading-relaxed">
            Delete {preferredDisplayName(person)}? This removes {relationshipCount(createGraphIndex(graph), person.id)} relationships.
          </p>
          {dialogError ? <p className="mt-3 text-sm text-danger">{dialogError}</p> : null}
          <div className="mt-5 flex gap-2">
            <Button tooltip="Keep this person" variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button tooltip="Delete this person and their relationships" variant="danger" onClick={() => void removePerson()}>
              Delete
            </Button>
          </div>
        </Overlay>
      ) : null}
    </main>
  );

  async function unlink(type: "parent" | "union", id: string) {
    const previous = store.getState().graph;
    store.getState().apply((draft) => {
      if (type === "parent") draft.parentLinks = draft.parentLinks.filter((link) => link.id !== id);
      else draft.unions = draft.unions.filter((union) => union.id !== id);
    });
    const result = await unlinkAction(props.id, type === "parent" ? { type, linkId: id } : { type, unionId: id });
    if (result.error) store.getState().rollback(previous);
  }

  async function changeKind(linkId: string, kind: ParentKind) {
    const previous = store.getState().graph;
    store.getState().apply((draft) => {
      const link = draft.parentLinks.find((item) => item.id === linkId);
      if (link) link.kind = kind;
    });
    const result = await updateParentLinkAction(props.id, linkId, kind);
    if (result.error) store.getState().rollback(previous);
  }

  async function changeStatus(unionId: string, status: UnionStatus) {
    const previous = store.getState().graph;
    store.getState().apply((draft) => {
      const union = draft.unions.find((item) => item.id === unionId);
      if (union) union.status = status;
    });
    const result = await updateUnionAction(props.id, unionId, { status });
    if ("error" in result) {
      store.getState().rollback(previous);
      setRelationError(result.error ?? "Could not save that relationship.");
      return;
    }
    setRelationError(null);
  }

  async function changeDates(unionId: string, patch: { startDate?: string | null; endDate?: string | null }) {
    const previous = store.getState().graph;
    store.getState().apply((draft) => {
      const union = draft.unions.find((item) => item.id === unionId);
      if (!union) return;
      if (patch.startDate !== undefined) union.startDate = patch.startDate;
      if (patch.endDate !== undefined) union.endDate = patch.endDate;
    });
    const result = await updateUnionAction(props.id, unionId, patch);
    if ("error" in result) {
      store.getState().rollback(previous);
      setRelationError(result.error ?? "Could not save that relationship.");
      return;
    }
    setRelationError(null);
  }

  async function reorder(unionId: string, direction: -1 | 1) {
    if (!person) return;
    const ordered = spouses(store.getState().index, person.id).map((entry) => entry.union.id);
    const indexOf = ordered.indexOf(unionId);
    const swap = indexOf + direction;
    const left = ordered[indexOf];
    const right = ordered[swap];
    if (!left || !right || swap < 0 || swap >= ordered.length) return;
    ordered[indexOf] = right;
    ordered[swap] = left;
    const previous = store.getState().graph;
    store.getState().apply((draft) => {
      ordered.forEach((id, order) => {
        const union = draft.unions.find((item) => item.id === id);
        if (union) union.sortOrder = order;
      });
    });
    const result = await reorderUnionsAction(props.id, person.id, ordered);
    if (result.error) store.getState().rollback(previous);
  }
}

function linkInput(
  role: AddRole | "root",
  anchorId: string,
  otherId: string,
  unionId: string | null,
  alsoSiblings = true,
  replacePlaceholder = true,
): LinkInput | null {
  if (role === "father" || role === "mother") return { kind: role, parentId: otherId, childId: anchorId, alsoSiblings, replacePlaceholder };
  if (role === "spouse") return { kind: "spouse", personId: anchorId, otherId };
  if (role === "child") return { kind: "child", parentId: anchorId, childId: otherId, unionId };
  if (role === "sibling") return { kind: "sibling", personId: anchorId, otherId };
  return null;
}

function Overlay({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-3xl">{title}</h2>
          <Button tooltip="Close" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function blankPerson(id: string, treeId: string, sex: Sex): GraphPerson {
  return {
    id,
    treeId,
    firstName: "",
    middleName: null,
    lastName: null,
    preferredName: null,
    birthSurname: null,
    sex,
    birthDate: null,
    birthDatePrecision: null,
    deathDate: null,
    deathDatePrecision: null,
    isDeceased: false,
    birthPlace: null,
    nativePlace: null,
    currentLocation: null,
    occupation: null,
    bio: null,
    hasPhoto: false,
    phoneWhatsapp: null,
    email: null,
    instagram: null,
    facebook: null,
    customFields: {},
    pending: true,
    clientKey: id,
  };
}

function writePersonUrl(basePath: string, personId: string, view: string, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  params.set("person", personId);
  params.set("view", view);
  const href = `${basePath}?${params.toString()}`;
  if (mode === "replace") window.history.replaceState(window.history.state, "", href);
  else window.history.pushState(window.history.state, "", href);
}

function findEditable(graph: TreeGraph, current: GraphPerson): GraphPerson | undefined {
  const key = current.clientKey ?? current.id;
  return graph.persons.find((item) => item.id === current.id || item.clientKey === key || item.aliases?.includes(current.id) || item.aliases?.includes(key));
}

function upsertById<T extends { id: string }>(list: T[], item: T) {
  const slot = list.findIndex((entry) => entry.id === item.id);
  if (slot >= 0) list[slot] = item;
  else list.push(item);
}

function absorbWrite(
  draft: TreeGraph,
  result: { persons?: GraphPerson[]; removedPersonIds?: string[]; parentLinks?: { id: string }[]; unions?: { id: string }[] },
) {
  const removed = new Set(result.removedPersonIds ?? []);
  if (removed.size > 0) {
    draft.persons = draft.persons.filter((person) => !removed.has(person.id));
    draft.parentLinks = draft.parentLinks.filter((link) => !removed.has(link.parentId) && !removed.has(link.childId));
    draft.unions = draft.unions.filter((union) => !removed.has(union.personAId) && !removed.has(union.personBId));
  }
  for (const person of result.persons ?? []) upsertById(draft.persons, person);
  for (const link of result.parentLinks ?? []) upsertById(draft.parentLinks, link as TreeGraph["parentLinks"][number]);
  for (const union of result.unions ?? []) upsertById(draft.unions, union as TreeGraph["unions"][number]);
}

function PlaceholderOption({
  dialog,
  index,
  onChange,
}: {
  dialog: { role: AddRole | "root"; anchorId: string; replacePlaceholder?: boolean };
  index: ReturnType<typeof createGraphIndex>;
  onChange: (replacePlaceholder: boolean) => void;
}) {
  if (dialog.role !== "father" && dialog.role !== "mother") return null;
  const unknown = (index.parentsOf.get(dialog.anchorId) ?? []).some((link) => index.personById.get(link.parentId)?.isPlaceholder);
  if (!unknown) return null;
  return (
    <label className="flex items-start gap-2 text-sm leading-snug">
      <input type="checkbox" className="mt-1" checked={dialog.replacePlaceholder !== false} onChange={(event) => onChange(event.target.checked)} />
      <span>Replace unknown parent</span>
    </label>
  );
}

function SiblingOption({
  dialog,
  index,
  onChange,
}: {
  dialog: { role: AddRole | "root"; anchorId: string };
  index: ReturnType<typeof createGraphIndex>;
  onChange: (alsoSiblings: boolean) => void;
}) {
  if (dialog.role !== "father" && dialog.role !== "mother") return null;
  const parents = (index.parentsOf.get(dialog.anchorId) ?? []).filter((link) => !index.personById.get(link.parentId)?.isPlaceholder);
  if (parents.length !== 1) return null;
  const existing = parents[0]?.parentId;
  const names = siblings(index, dialog.anchorId)
    .filter((entry) => (index.parentsOf.get(entry.person.id) ?? []).some((link) => link.parentId === existing))
    .map((entry) => preferredDisplayName(entry.person));
  if (names.length === 0) return null;
  return (
    <label className="flex items-start gap-2 text-sm leading-snug">
      <input type="checkbox" className="mt-1" defaultChecked onChange={(event) => onChange(event.target.checked)} />
      <span>Also parent of {names.join(", ")}</span>
    </label>
  );
}
