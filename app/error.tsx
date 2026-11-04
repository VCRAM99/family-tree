"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-24">
      <p className="font-display text-6xl tracking-tight">Something went wrong</p>
      <p className="mt-4 text-sm leading-relaxed text-muted">The page could not be opened. You can try again.</p>
      <button type="button" onClick={reset} className="mt-8 inline-flex h-11 items-center self-start rounded-full bg-accent px-5 text-sm text-surface">
        Try again
      </button>
    </main>
  );
}
