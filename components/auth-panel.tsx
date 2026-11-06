"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/button";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/paths";

type Mode = "sign-in" | "sign-up";

export function AuthPanel({ nextPath, initialMode = "sign-in" }: { nextPath?: string; initialMode?: Mode }) {
  const router = useRouter();
  const destination = safeNextPath(nextPath);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: destination,
        });
        if (result.error) {
          setError(result.error.message ?? "Could not create the account.");
          return;
        }
        setNotice(
          process.env.NODE_ENV === "development"
            ? "Check your email for a verification link. In local development it is printed in the server console."
            : "Check your email for a verification link.",
        );
        return;
      }

      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        callbackURL: destination,
      });
      if (result.error) {
        if (result.error.status === 403) {
          setError(
            process.env.NODE_ENV === "development"
              ? "Verify your email before signing in. A fresh link is on its way — check the server console if you are developing locally."
              : "Verify your email before signing in. A fresh link is on its way.",
          );
          return;
        }
        setError(result.error.message ?? "Could not sign in.");
        return;
      }
      router.push(destination);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col">
      <div className="mb-8 flex gap-6 text-sm">
        <Button
          tooltip="Sign in with email"
          variant={mode === "sign-in" ? "primary" : "ghost"}
          className="h-9 px-0"
          onClick={() => {
            setMode("sign-in");
            setError(null);
            setNotice(null);
          }}
        >
          Sign in
        </Button>
        <Button
          tooltip="Create a new account"
          variant={mode === "sign-up" ? "primary" : "ghost"}
          className="h-9 px-0"
          onClick={() => {
            setMode("sign-up");
            setError(null);
            setNotice(null);
          }}
        >
          Create account
        </Button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "sign-up" ? (
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted">Name</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="h-12 rounded-2xl border border-border bg-surface px-4 text-text outline-none"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="h-12 rounded-2xl border border-border bg-surface px-4 text-text outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Password</span>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            className="h-12 rounded-2xl border border-border bg-surface px-4 text-text outline-none"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {notice ? <p className="text-sm leading-relaxed text-muted">{notice}</p> : null}
        <Button
          tooltip={mode === "sign-up" ? "Create your account and send a verification email" : "Sign in to your trees"}
          type="submit"
          disabled={pending}
          className="mt-2 w-full"
        >
          {pending ? "Please wait" : mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4">
        <Button
          tooltip="Email yourself a password reset link"
          variant="ghost"
          className="h-9 px-0"
          onClick={() => router.push("/forgot-password")}
        >
          Forgot password
        </Button>
      </div>
    </div>
  );
}
