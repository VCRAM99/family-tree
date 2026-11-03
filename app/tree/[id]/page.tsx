import Link from "next/link";

import { Tooltip } from "@/components/tooltip";
import { requireUser } from "@/lib/server/session";
import { readTree } from "@/lib/server/trees";

export default async function TreePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const tree = await readTree(user.id, id);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col justify-center px-6 pb-24">
      <p className="text-xs tracking-[0.22em] text-muted uppercase">Tree</p>
      <h1 className="mt-3 font-display text-6xl tracking-tight">{tree.name}</h1>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">Tree view coming in prompt 3.</p>
      <Tooltip content="Open sharing, fields, and theme" side="bottom" className="mt-8">
        <Link href={`/tree/${tree.id}/settings`} className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
          Settings
        </Link>
      </Tooltip>
    </main>
  );
}
