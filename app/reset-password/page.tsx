"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/button";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-20">
      <p className="font-display text-5xl tracking-tight">Choose a new password</p>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token) {
            setError("This reset link is missing its token.");
            return;
          }
          setPending(true);
          setError(null);
          void authClient
            .resetPassword({ newPassword: password, token })
            .then((result) => {
              if (result.error) {
                setError(result.error.message ?? "Could not reset the password.");
                return;
              }
              router.push("/");
            })
            .finally(() => setPending(false));
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">New password</span>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className="h-12 rounded-2xl border border-border bg-surface px-4"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button tooltip="Save the new password" type="submit" disabled={pending}>
          {pending ? "Saving" : "Update password"}
        </Button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
