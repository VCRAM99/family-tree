export default function TreeLoading() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center" aria-busy="true">
      <p className="sr-only">Loading the tree</p>
      <div className="h-40 w-64 animate-pulse rounded-4xl border border-border bg-surface" />
    </div>
  );
}
