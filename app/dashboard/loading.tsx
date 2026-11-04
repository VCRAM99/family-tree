export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-10" aria-busy="true">
      <p className="sr-only">Loading your trees</p>
      <div className="h-4 w-28 animate-pulse rounded-full bg-border" />
      <div className="mt-4 h-14 w-48 animate-pulse rounded-2xl bg-border" />
      <div className="mt-12 h-28 animate-pulse rounded-[2rem] border border-border bg-surface" />
    </main>
  );
}
