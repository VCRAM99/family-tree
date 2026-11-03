import Link from "next/link";

import { Tooltip } from "@/components/tooltip";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-24">
      <p className="font-display text-6xl tracking-tight">Not found</p>
      <p className="mt-4 text-sm leading-relaxed text-muted">That page is not in this archive.</p>
      <Tooltip content="Return home" className="mt-8">
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-surface">
          Home
        </Link>
      </Tooltip>
    </main>
  );
}
