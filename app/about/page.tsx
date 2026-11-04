import Link from "next/link";

export const metadata = {
  title: "About Family Tree",
  description: "A quiet archive for names, places, and the people who connect them.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-20">
      <p className="text-xs tracking-[0.22em] text-muted uppercase">About</p>
      <h1 className="mt-4 font-display text-5xl tracking-tight">A room for a family.</h1>
      <p className="mt-6 text-base leading-relaxed text-muted">
        Family Tree keeps a private record of the people who made you. Share a public page, send an unlisted code, or invite someone to help tend the tree.
      </p>
      <Link href="/" className="mt-8 inline-flex h-11 items-center self-start rounded-full bg-accent px-5 text-sm text-surface">
        Back home
      </Link>
    </main>
  );
}
