import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { Tooltip } from "@/components/tooltip";
import type { SessionUser } from "@/lib/server/auth";

export function TopBar({ user, suggestions }: { user: SessionUser; suggestions?: { href: string; count: number } }) {
  return (
    <header className="flex items-center justify-between gap-6 px-6 py-5 sm:px-10">
      <Tooltip content="Back to your trees" side="bottom">
        <Link href="/dashboard" className="font-display text-2xl tracking-tight text-text">
          Family Tree
        </Link>
      </Tooltip>
      <div className="flex items-center gap-2 sm:gap-4">
        {suggestions ? (
          <Tooltip content="Review suggestions" side="bottom">
            <Link href={suggestions.href} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm">
              Suggestions
              {suggestions.count > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs text-surface">{suggestions.count}</span>
              ) : null}
            </Link>
          </Tooltip>
        ) : null}
        <p className="hidden text-sm text-muted sm:block">{user.email}</p>
        <SignOutButton />
      </div>
    </header>
  );
}
