"use client";

import { useState, useTransition } from "react";

import { changeNameAction, changePasswordAction, deleteAccountAction } from "@/app/account/actions";
import { Button } from "@/components/button";

export function AccountForm({ name, email }: { name: string; email: string }) {
  const [displayName, setDisplayName] = useState(name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <p className="text-xs tracking-[0.22em] text-muted uppercase">Account</p>
      <h1 className="mt-3 font-display text-5xl tracking-tight">Your account</h1>
      <p className="mt-3 text-sm text-muted">{email}</p>

      <form
        className="mt-10 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await changeNameAction(displayName);
            if (result.error) setError(result.error);
            else setMessage("Name saved.");
          });
        }}
      >
        <label className="text-sm text-muted" htmlFor="display-name">
          Display name
        </label>
        <input
          id="display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="h-12 rounded-2xl border border-border bg-surface px-4"
        />
        <Button tooltip="Save your display name" type="submit" disabled={pending}>
          Save name
        </Button>
      </form>

      <form
        className="mt-12 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await changePasswordAction(currentPassword, newPassword);
            if (result.error) setError(result.error);
            else {
              setCurrentPassword("");
              setNewPassword("");
              setMessage("Password updated.");
            }
          });
        }}
      >
        <h2 className="font-display text-3xl">Password</h2>
        <label className="text-sm text-muted" htmlFor="current-password">
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="h-12 rounded-2xl border border-border bg-surface px-4"
        />
        <label className="text-sm text-muted" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="h-12 rounded-2xl border border-border bg-surface px-4"
        />
        <Button tooltip="Replace your password" type="submit" variant="secondary" disabled={pending}>
          Change password
        </Button>
      </form>

      <form
        className="mt-12 flex flex-col gap-3 rounded-[2rem] border border-border p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await deleteAccountAction(confirmation);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <h2 className="font-display text-3xl">Delete account</h2>
        <p className="text-sm leading-relaxed text-muted">
          This deletes every tree you own, and removes you from trees you help tend. Type {email} to confirm.
        </p>
        <label className="text-sm text-muted" htmlFor="delete-confirmation">
          Confirmation
        </label>
        <input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          className="h-12 rounded-2xl border border-border bg-surface px-4"
        />
        <Button tooltip="Permanently delete this account and the trees you own" type="submit" variant="danger" disabled={pending}>
          Delete account
        </Button>
      </form>
      {message ? <p className="mt-6 text-sm">{message}</p> : null}
      {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}
    </main>
  );
}
