"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/button";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-20">
      <p className="font-display text-5xl tracking-tight">Reset password</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        We will email a reset link if an account exists. Locally, the link is printed in the server console.
      </p>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          void authClient
            .requestPasswordReset({
              email: email.trim(),
              redirectTo: "/reset-password",
            })
            .then((result) => {
              if (result.error) setError(result.error.message ?? "Could not send the reset email.");
              else setMessage("If that account exists, a reset link is on its way.");
            })
            .finally(() => setPending(false));
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 rounded-2xl border border-border bg-surface px-4"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-muted">{message}</p> : null}
        <Button tooltip="Send a password reset link" type="submit" disabled={pending}>
          {pending ? "Sending" : "Send reset link"}
        </Button>
      </form>
      <Button tooltip="Return to sign in" variant="ghost" className="mt-4 h-9 self-start px-0" onClick={() => router.push("/")}>
        Back
      </Button>
    </main>
  );
}
