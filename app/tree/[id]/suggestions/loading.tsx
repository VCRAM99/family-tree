export default function SuggestionsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16" aria-busy="true">
      <p className="sr-only">Loading suggestions</p>
      <div className="h-4 w-24 animate-pulse rounded-full bg-border" />
      <div className="mt-4 h-14 w-64 animate-pulse rounded-2xl bg-border" />
      <div className="mt-8 h-32 animate-pulse rounded-[2rem] border border-border bg-surface" />
    </main>
  );
}
