export function SplashFrame() {
  return (
    <div className="relative h-56 overflow-hidden rounded-4xl border border-border bg-surface/70 lg:h-128" aria-hidden>
      <div className="absolute top-8 left-1/2 flex -translate-x-1/2 gap-4">
        <span className="h-14 w-24 rounded-2xl border border-border bg-background" />
        <span className="h-14 w-24 rounded-2xl border border-border bg-background" />
      </div>
      <div className="absolute top-28 left-1/2 h-8 w-px -translate-x-1/2 bg-border" />
      <div className="absolute top-36 left-1/2 flex -translate-x-1/2 gap-4">
        <span className="h-14 w-24 rounded-2xl border border-border bg-background" />
        <span className="h-14 w-24 rounded-2xl border border-border bg-background" />
        <span className="hidden h-14 w-24 rounded-2xl border border-border bg-background sm:block" />
      </div>
    </div>
  );
}
