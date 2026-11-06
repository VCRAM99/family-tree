"use client";

import { useEffect, useState } from "react";

import { Autosuggest } from "@/components/autosuggest";
import { Button } from "@/components/button";
import { loadCityChunk } from "@/lib/cities";
import type { AutosaveStatus } from "@/lib/autosave";
import { useAutosave } from "@/lib/use-autosave";
import { locationSuggestions, type CityRecord } from "@/lib/suggestions";

export function LocationField({
  label,
  value,
  places,
  editing,
  birthPlace,
  sameAsBirth = false,
  onSave,
  onStatus,
  autosave = true,
}: {
  label: string;
  value: string;
  places: string[];
  editing: boolean;
  birthPlace?: string;
  sameAsBirth?: boolean;
  onSave: (value: string) => Promise<void>;
  onStatus?: (status: AutosaveStatus) => void;
  autosave?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);
  const [linked, setLinked] = useState(() => Boolean(sameAsBirth && birthPlace && value === birthPlace));
  const [cities, setCities] = useState<CityRecord[]>([]);
  const { status, push, retry } = useAutosave(onSave, 600, !autosave);
  if (value !== seen) {
    setSeen(value);
    if (!dirty || value === local) {
      setLocal(value);
      setDirty(false);
    }
  }
  const birthSignature = `${linked ? "1" : "0"}|${birthPlace ?? ""}`;
  const [seenBirth, setSeenBirth] = useState(birthSignature);
  if (birthSignature !== seenBirth) {
    setSeenBirth(birthSignature);
    if (linked && (birthPlace ?? "") !== local) {
      setLocal(birthPlace ?? "");
      setDirty(true);
      push(birthPlace ?? "");
    }
  }

  useEffect(() => {
    if (status !== "idle") onStatus?.(status);
  }, [onStatus, status]);

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    void loadCityChunk(local).then((rows) => {
      if (!cancelled) setCities(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [focused, local]);

  if (!editing) {
    if (!value) return null;
    return (
      <div>
        <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-1">{value}</p>
      </div>
    );
  }

  const suggestions = locationSuggestions(places, cities, linked && birthPlace != null ? birthPlace : local);

  return (
    <label className="block">
      <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
      <span className="mt-2 block">
        <Autosuggest
          label={label}
          value={linked && birthPlace != null ? birthPlace : local}
          suggestions={suggestions}
          onFocus={() => setFocused(true)}
          onChange={(next) => {
            setLinked(false);
            setDirty(true);
            setFocused(true);
            setLocal(next);
            push(next);
          }}
        />
      </span>
      {sameAsBirth ? (
        <span className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={linked}
            aria-label={`${label} same as birth place`}
            onChange={(event) => {
              const next = event.target.checked;
              setLinked(next);
              if (!next || birthPlace == null) return;
              setDirty(true);
              setLocal(birthPlace);
              push(birthPlace);
            }}
          />
          Same as birth place
        </span>
      ) : null}
      {status === "retry" ? (
        <Button tooltip="Try saving again" variant="ghost" className="mt-1 h-9 px-3 text-danger" onClick={() => retry()}>
          Retry
        </Button>
      ) : null}
    </label>
  );
}
