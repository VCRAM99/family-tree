"use client";

import { useState, useTransition } from "react";

import { approveSuggestionAction, rejectSuggestionAction } from "@/app/tree/[id]/suggestions/actions";
import { Button } from "@/components/button";

type Row = {
  id: string;
  type: "new_person" | "contact_update" | "correction";
  status: "pending" | "approved" | "rejected";
  payload: Record<string, unknown>;
  targetName: string;
  diff: { field: string; current: string; proposed: string }[];
  createdAt: string;
  submitterName: string;
  submitterEmail: string;
};

export function SuggestionInbox({ treeId, suggestions }: { treeId: string; suggestions: Row[] }) {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const pending = suggestions.filter((row) => row.status === "pending");
  const history = suggestions.filter((row) => row.status !== "pending");
  const rows = tab === "pending" ? pending : history;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <p className="text-xs tracking-[0.22em] text-muted uppercase">Review</p>
      <h1 className="mt-3 font-display text-5xl tracking-tight">Suggestions</h1>
      <div className="mt-6 flex gap-2">
        <Button tooltip="Suggestions waiting for a decision" variant={tab === "pending" ? "primary" : "secondary"} onClick={() => setTab("pending")}>
          Pending ({pending.length})
        </Button>
        <Button tooltip="Suggestions that were approved or rejected" variant={tab === "history" ? "primary" : "secondary"} onClick={() => setTab("history")}>
          History
        </Button>
      </div>
      <ul className="mt-8 flex flex-col gap-4">
        {rows.length === 0 ? <li className="text-sm text-muted">{tab === "pending" ? "Nothing is waiting." : "No reviewed suggestions yet."}</li> : null}
        {rows.map((row) => (
          <SuggestionCard key={row.id} treeId={treeId} row={row} />
        ))}
      </ul>
    </main>
  );
}

function SuggestionCard({ treeId, row }: { treeId: string; row: Row }) {
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = approve
        ? await approveSuggestionAction(treeId, row.id, editing ? editedPayload(row, overrides) : undefined)
        : await rejectSuggestionAction(treeId, row.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <li className="rounded-[2rem] border border-border bg-surface p-6">
      <p className="text-xs tracking-[0.16em] text-muted uppercase">{label(row.type)} · {row.status}</p>
      <p className="mt-2 text-sm">
        {row.submitterName} · {row.submitterEmail}
      </p>
      <p className="mt-1 text-sm text-muted">About {row.targetName}</p>
      <div className="mt-4 grid grid-cols-[8rem_1fr_1fr] gap-x-3 gap-y-2 text-sm">
        <span className="text-xs tracking-wide text-muted uppercase">Field</span>
        <span className="text-xs tracking-wide text-muted uppercase">Current</span>
        <span className="text-xs tracking-wide text-muted uppercase">Proposed</span>
        {row.diff.map((change) => (
          <div key={change.field} className="col-span-3 grid grid-cols-subgrid">
            <span className="text-muted">{change.field}</span>
            <span>{change.current}</span>
            {editing ? (
              <input
                value={overrides[change.field] ?? change.proposed}
                onChange={(event) => setOverrides((current) => ({ ...current, [change.field]: event.target.value }))}
                className="h-10 rounded-xl border border-border bg-background px-3"
              />
            ) : (
              <span>{change.proposed}</span>
            )}
          </div>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {row.status === "pending" ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button tooltip="Apply this suggestion to the tree" disabled={pending} onClick={() => decide(true)}>
            Approve
          </Button>
          <Button tooltip="Change the proposal, then approve it" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
            Edit then approve
          </Button>
          <Button tooltip="Decline this suggestion" variant="ghost" disabled={pending} onClick={() => decide(false)}>
            Reject
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function label(type: Row["type"]) {
  if (type === "new_person") return "New person";
  if (type === "contact_update") return "Contact";
  return "Correction";
}

function editedPayload(row: Row, overrides: Record<string, string>): Record<string, unknown> {
  if (row.type === "correction") {
    const patch = { ...(typeof row.payload.patch === "object" && row.payload.patch ? row.payload.patch : {}), ...overrides };
    return { ...row.payload, patch };
  }
  return { ...row.payload, ...overrides };
}
