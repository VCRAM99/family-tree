import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { Tooltip } from "@/components/tooltip";
import type { SessionUser } from "@/lib/server/auth";

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="flex items-center justify-between gap-6 px-6 py-5 sm:px-10">
      <Tooltip content="Back to your trees" side="bottom">
        <Link href="/dashboard" className="font-display text-2xl tracking-tight text-text">
          Family Tree
        </Link>
      </Tooltip>
      <div className="flex items-center gap-2 sm:gap-4">
        <p className="hidden text-sm text-muted sm:block">{user.email}</p>
        <SignOutButton />
      </div>
    </header>
  );
}
