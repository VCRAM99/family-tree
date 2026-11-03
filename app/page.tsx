import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth-panel";
import { TreeLookup } from "@/components/tree-lookup";
import { safeNextPath } from "@/lib/paths";
import { getCurrentUser } from "@/lib/server/session";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeNextPath(params.next));

  return (
    <main className="grid min-h-full lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
      <section className="flex min-h-[42vh] flex-col justify-between px-6 py-10 sm:px-12 lg:min-h-screen lg:px-16 lg:py-14">
        <div>
          <p className="text-xs tracking-[0.28em] text-muted uppercase">Family archive</p>
          <h1 className="mt-6 max-w-xl font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl">
            The people who made you.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            A private record of names, places, and the ties between them. Generous margins. No clutter.
          </p>
        </div>
        <div className="mt-16 rounded-[2rem] border border-border bg-surface/70 px-8 py-10">
          <p className="font-display text-4xl italic text-text/80">The tree will unfold here.</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            This panel is a quiet placeholder. The opening animation arrives in a later pass.
          </p>
        </div>
      </section>
      <section className="flex items-center border-border px-6 py-12 sm:px-12 lg:border-l lg:px-16">
        <div className="w-full">
          <AuthPanel nextPath={params.next} initialMode={params.mode === "sign-up" ? "sign-up" : "sign-in"} />
          <TreeLookup />
        </div>
      </section>
    </main>
  );
}
