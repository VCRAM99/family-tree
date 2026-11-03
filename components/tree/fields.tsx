"use client";

import { useEffect, useState } from "react";

import type { AutosaveStatus } from "@/lib/autosave";
import { useAutosave } from "@/lib/use-autosave";
import { Button } from "@/components/button";

const inputClass = "w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none";

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
      <path d="M3 5.5 L7 9.5 L11 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TextField({
  label,
  value,
  editing,
  placeholder,
  multiline = false,
  onSave,
  validate,
  onStatus,
  autoFocus = false,
}: {
  label: string;
  value: string;
  editing: boolean;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  validate?: (value: string) => string | null;
  onSave: (value: string) => Promise<void>;
  onStatus?: (status: AutosaveStatus) => void;
}) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, push, retry } = useAutosave(onSave);
  if (value !== seen) {
    setSeen(value);
    if (!dirty || value === local) {
      setLocal(value);
      setDirty(false);
    }
  }

  useEffect(() => {
    if (status !== "idle") onStatus?.(status);
  }, [onStatus, status]);

  if (!editing) {
    if (!value) return null;
    return (
      <div>
        <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
        <p className={`mt-1 whitespace-pre-wrap leading-relaxed ${multiline ? "" : ""}`}>{value}</p>
      </div>
    );
  }

  function change(next: string) {
    setDirty(true);
    setLocal(next);
    const message = validate?.(next) ?? null;
    setError(message);
    if (!message) push(next);
  }

  const control = multiline ? (
    <textarea
      value={local}
      rows={4}
      placeholder={placeholder}
      aria-label={label}
      className={`${inputClass} py-3`}
      onChange={(event) => change(event.target.value)}
    />
  ) : (
    <input
      value={local}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={label}
      className={`${inputClass} h-12`}
      onChange={(event) => change(event.target.value)}
    />
  );

  return (
    <label className="block">
      <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
      <span className="mt-2 block">{control}</span>
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : null}
      {status === "retry" ? (
        <Button tooltip="Try saving again" variant="ghost" className="mt-1 h-9 px-3 text-danger" onClick={() => retry()}>
          Retry
        </Button>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  editing,
  options,
  onSave,
  onStatus,
}: {
  label: string;
  value: string;
  editing: boolean;
  options: { value: string; label: string }[];
  onSave: (value: string) => Promise<void>;
  onStatus?: (status: AutosaveStatus) => void;
}) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  const [dirty, setDirty] = useState(false);
  const { status, push, retry } = useAutosave(onSave);
  if (value !== seen) {
    setSeen(value);
    if (!dirty || value === local) {
      setLocal(value);
      setDirty(false);
    }
  }
  useEffect(() => {
    if (status !== "idle") onStatus?.(status);
  }, [onStatus, status]);
  const current = options.find((option) => option.value === local)?.label ?? local;
  if (!editing) {
    if (!value || !current) return null;
    return (
      <div>
        <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-1">{current}</p>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
      <span className="relative mt-2 block">
        <select
          aria-label={label}
          value={local}
          className={`${inputClass} h-12 appearance-none pr-10`}
          onChange={(event) => {
            setDirty(true);
            setLocal(event.target.value);
            push(event.target.value);
          }}
        >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        </select>
        <Chevron />
      </span>
      {status === "retry" ? (
        <Button tooltip="Try saving again" variant="ghost" className="mt-1 h-9 px-3 text-danger" onClick={() => retry()}>
          Retry
        </Button>
      ) : null}
    </label>
  );
}
