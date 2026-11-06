"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { resolveTreeLookup, searchPublicTreesAction } from "@/app/view-actions";
import { Button } from "@/components/button";
import { classifyTreeLookup } from "@/lib/public-tag";

export function TreeLookup({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ name: string; publicTag: string }[]>([]);
  const kind = value.trim() ? classifyTreeLookup(value) : null;

  return (
    <form
      className={embedded ? "flex flex-col gap-4" : "mt-10 border-t border-border pt-8"}
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        void resolveTreeLookup(value).then((result) => {
          if (result.href) router.push(result.href);
          else setMessage(result.error ?? "We couldn't find that tree.");
        });
      }}
    >
      {embedded ? null : <p className="font-display text-3xl tracking-tight">View a family tree</p>}
      <p className={embedded ? "text-sm leading-relaxed text-muted" : "mt-2 text-sm leading-relaxed text-muted"}>Use an 8-character share code, or a public tag.</p>
      <label className="mt-5 flex flex-col gap-2 text-sm">
        <span className="text-muted">Code or tag</span>
        <input
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            setMessage(null);
            if (classifyTreeLookup(next) === "share_code") {
              setMatches([]);
              return;
            }
            void searchPublicTreesAction(next).then(setMatches);
          }}
          autoCapitalize="characters"
          spellCheck={false}
          className="h-12 rounded-2xl border border-border bg-surface px-4 tracking-wide text-text outline-none"
        />
      </label>
      {kind === "share_code" ? <p className="mt-2 text-xs text-muted">Looks like a share code.</p> : null}
      {kind === "public_tag" ? <p className="mt-2 text-xs text-muted">Looks like a public tag.</p> : null}
      {matches.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {matches.map((match) => (
            <li key={match.publicTag}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between rounded-2xl px-3 py-2 text-left hover:bg-surface"
                onClick={() => router.push(`/${match.publicTag}`)}
              >
                <span>{match.name}</span>
                <span className="text-xs text-muted">{match.publicTag}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p> : null}
      <Button tooltip="Open the tree for this code or public tag" type="submit" variant="secondary" className="mt-4">
        View tree
      </Button>
    </form>
  );
}
