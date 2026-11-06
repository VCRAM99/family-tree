import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth-panel";
import { LazySplashTree } from "@/components/lazy-splash-tree";
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
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10 lg:py-14">
      <header className="max-w-xl">
        <p className="text-xs tracking-[0.28em] text-muted uppercase">Family archive</p>
        <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">The people who made you.</h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted">A private record of names, places, and the ties between them.</p>
        <Link href="/about" className="mt-4 inline-flex text-sm text-muted underline decoration-border underline-offset-4">
          Learn more
        </Link>
      </header>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="order-2 lg:order-1">
          <LazySplashTree />
        </div>
        <section className="order-1 lg:order-2">
          <AuthPanel nextPath={params.next} initialMode={params.mode === "sign-up" ? "sign-up" : "sign-in"} />
        </section>
      </div>
    </main>
  );
}
