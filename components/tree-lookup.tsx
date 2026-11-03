"use client";

import { useState } from "react";

import { Button } from "@/components/button";
import { classifyTreeLookup } from "@/lib/public-tag";

export function TreeLookup() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const kind = value.trim() ? classifyTreeLookup(value) : null;

  return (
    <form
      className="mt-10 border-t border-border pt-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (kind === "invalid" || !kind) {
          setMessage("Enter an 8-character share code or a public tag.");
          return;
        }
        setMessage("Opening a tree from a code or tag arrives in a later update. This field only checks the format for now.");
      }}
    >
      <p className="font-display text-3xl tracking-tight">View a family tree</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">Use an 8-character share code, or a public tag.</p>
      <label className="mt-5 flex flex-col gap-2 text-sm">
        <span className="text-muted">Code or tag</span>
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage(null);
          }}
          autoCapitalize="characters"
          spellCheck={false}
          className="h-12 rounded-2xl border border-border bg-surface px-4 tracking-wide text-text outline-none"
        />
      </label>
      {kind === "share_code" ? <p className="mt-2 text-xs text-muted">Looks like a share code.</p> : null}
      {kind === "public_tag" ? <p className="mt-2 text-xs text-muted">Looks like a public tag.</p> : null}
      {message ? <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p> : null}
      <Button tooltip="Check the code or tag format" type="submit" variant="secondary" className="mt-4">
        View tree
      </Button>
    </form>
  );
}
