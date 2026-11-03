"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { createTreeAction, deleteTreeAction, renameTreeAction, respondInviteAction } from "@/app/dashboard/actions";
import { Button } from "@/components/button";
import { Tooltip } from "@/components/tooltip";
import type { TreeListItem } from "@/lib/tree-list";

const visibilityLabel = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
} as const;

export function DashboardView({
  trees,
  invites = [],
}: {
  trees: TreeListItem[];
  invites?: { id: string; treeId: string; treeName: string }[];
}) {
  const [creating, setCreating] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-6 pt-8">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted uppercase">Your archive</p>
          <h1 className="mt-3 font-display text-5xl tracking-tight sm:text-6xl">Trees</h1>
        </div>
        <Button tooltip="Start a new family tree" onClick={() => setCreating(true)}>
          New tree
        </Button>
      </div>

      {invites.length > 0 ? <InviteList invites={invites} /> : null}

      {creating ? <CreateTreeForm onClose={() => setCreating(false)} /> : null}

      {trees.length === 0 ? (
        <section className="mt-16 rounded-[2rem] border border-dashed border-border px-8 py-20 text-center">
          <h2 className="font-display text-4xl tracking-tight">No trees yet</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            A tree is a private room for a family. Create one, then invite the people who should help tend it.
          </p>
          <Button tooltip="Create your first family tree" className="mt-8" onClick={() => setCreating(true)}>
            Create a tree
          </Button>
        </section>
      ) : (
        <ul className="mt-14 grid gap-5">
          {trees.map((tree) => (
            <li key={tree.id}>
              <TreeCard tree={tree} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function InviteList({ invites }: { invites: { id: string; treeName: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="mt-10 rounded-[2rem] border border-border bg-surface p-6">
      <h2 className="font-display text-3xl">Invitations</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
            <p>{invite.treeName}</p>
            <div className="flex gap-2">
              <Button
                tooltip="Accept this admin invitation"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await respondInviteAction(invite.id, true);
                    if (result.error) setError(result.error);
                  });
                }}
              >
                Accept
              </Button>
              <Button
                tooltip="Decline this admin invitation"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await respondInviteAction(invite.id, false);
                    if (result.error) setError(result.error);
                  });
                }}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}

function CreateTreeForm({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-10 rounded-[2rem] border border-border bg-surface p-6 sm:p-8"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createTreeAction(formData);
          if (result?.error) setError(result.error);
        });
      }}
    >
      <h2 className="font-display text-3xl">New tree</h2>
      <label className="mt-6 flex flex-col gap-2 text-sm">
        <span className="text-muted">Name</span>
        <input name="name" required maxLength={80} className="h-12 rounded-2xl border border-border bg-background px-4" />
      </label>
      <label className="mt-4 flex flex-col gap-2 text-sm">
        <span className="text-muted">Description</span>
        <textarea name="description" maxLength={2000} rows={3} className="rounded-2xl border border-border bg-background px-4 py-3" />
      </label>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-6 flex gap-3">
        <Button tooltip="Save this tree and open it" type="submit" disabled={pending}>
          {pending ? "Creating" : "Create"}
        </Button>
        <Button tooltip="Close without creating" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TreeCard({ tree }: { tree: TreeListItem }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(tree.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <article className="rounded-[2rem] border border-border bg-surface px-6 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted uppercase">
            {tree.role === "owner" ? "Owner" : "Admin"} · {visibilityLabel[tree.visibility]}
          </p>
          <h2 className="mt-2 font-display text-4xl tracking-tight">{tree.name}</h2>
          {tree.description ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{tree.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Tooltip content="Open the tree" side="bottom">
            <Link href={`/tree/${tree.id}`} className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-surface">
              Open
            </Link>
          </Tooltip>
          <Tooltip content="Visibility, sharing, and theme" side="bottom">
            <Link
              href={`/tree/${tree.id}/settings`}
              className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm"
            >
              Settings
            </Link>
          </Tooltip>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button tooltip="Change the tree name" variant="secondary" className="h-9" onClick={() => setRenaming((value) => !value)}>
          Rename
        </Button>
        {tree.role === "owner" ? (
          <Button tooltip="Delete this tree after typing its name" variant="ghost" className="h-9 text-danger" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        ) : null}
      </div>
      {renaming ? (
        <form
          className="mt-4 flex flex-wrap items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await renameTreeAction(tree.id, name);
              if (result?.error) setError(result.error);
              else setRenaming(false);
            });
          }}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 min-w-56 rounded-2xl border border-border bg-background px-4" />
          <Button tooltip="Save the new name" type="submit" disabled={pending} className="h-9">
            Save name
          </Button>
        </form>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {deleting ? (
        <DeleteDialog
          name={tree.name}
          pending={pending}
          onCancel={() => setDeleting(false)}
          onConfirm={(typed) => {
            setError(null);
            startTransition(async () => {
              const result = await deleteTreeAction(tree.id, typed);
              if (result?.error) {
                setError(result.error);
                setDeleting(false);
              }
            });
          }}
        />
      ) : null}
    </article>
  );
}

function DeleteDialog({
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (typed: string) => void;
}) {
  const [typed, setTyped] = useState("");

  return (
    <form
      className="mt-6 rounded-3xl border border-border bg-background p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(typed);
      }}
    >
      <p className="font-display text-2xl">Delete {name}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This removes the people, relationships, and photos in this tree. Type <span className="text-text">{name}</span> to confirm.
      </p>
      <input
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        className="mt-4 h-11 w-full rounded-2xl border border-border bg-surface px-4"
        aria-label="Tree name confirmation"
      />
      <div className="mt-4 flex gap-3">
        <Button tooltip="Permanently delete this tree" type="submit" variant="danger" disabled={pending || typed !== name}>
          Delete tree
        </Button>
        <Button tooltip="Keep this tree" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
