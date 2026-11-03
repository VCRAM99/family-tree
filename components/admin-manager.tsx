"use client";

import { useState, useTransition } from "react";

import { inviteAdminAction, removeAdminAction, revokeInviteAction } from "@/app/tree/[id]/settings/actions";
import { Button } from "@/components/button";

export type AdminRow = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "admin";
  status: "pending" | "accepted";
};

export function AdminManager({ treeId, admins }: { treeId: string; admins: AdminRow[] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-12">
      <h2 className="font-display text-3xl">Admins</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">Only the owner can invite, revoke, or remove admins.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="h-12 min-w-64 flex-1 rounded-2xl border border-border bg-surface px-4"
        />
        <Button
          tooltip="Invite this email as an admin"
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await inviteAdminAction(treeId, email);
              if (result.error) setError(result.error);
              else setEmail("");
            });
          }}
        >
          Invite
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <ul className="mt-6 flex flex-col gap-3">
        {admins.map((admin) => (
          <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
            <div>
              <p>{admin.name ?? admin.email}</p>
              <p className="text-xs text-muted">
                {admin.email} · {admin.role} · {admin.status}
              </p>
            </div>
            {admin.role === "owner" ? null : admin.status === "pending" ? (
              <Button
                tooltip="Cancel this invitation"
                variant="ghost"
                onClick={() => {
                  startTransition(async () => {
                    const result = await revokeInviteAction(treeId, admin.id);
                    if (result.error) setError(result.error);
                  });
                }}
              >
                Revoke
              </Button>
            ) : (
              <Button
                tooltip="Remove this admin from the tree"
                variant="danger"
                onClick={() => {
                  startTransition(async () => {
                    const result = await removeAdminAction(treeId, admin.id);
                    if (result.error) setError(result.error);
                  });
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
