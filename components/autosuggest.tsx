"use client";

import { useId, useState } from "react";

const inputClass = "w-full rounded-2xl border border-border bg-background px-4 text-sm text-text outline-none";

export function Autosuggest({
  label,
  value,
  suggestions,
  placeholder,
  autoFocus = false,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  value: string;
  suggestions: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = open ? suggestions.filter((item) => item.toLowerCase() !== value.trim().toLowerCase()) : [];
  const index = shown.length === 0 ? 0 : Math.min(active, shown.length - 1);
  const activeId = shown[index] ? `${listId}-${index}` : undefined;

  function accept(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <span className="relative block">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? activeId : undefined}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`${inputClass} h-12`}
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onChange={(event) => {
          setActive(0);
          setOpen(true);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && shown.length > 0) {
            event.preventDefault();
            setActive((current) => (current + 1) % shown.length);
            return;
          }
          if (event.key === "ArrowUp" && shown.length > 0) {
            event.preventDefault();
            setActive((current) => (current - 1 + shown.length) % shown.length);
            return;
          }
          if ((event.key === "Enter" || event.key === "Tab") && shown[index]) {
            event.preventDefault();
            accept(shown[index]);
            return;
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {shown.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-border bg-surface py-1 shadow-sm">
          {shown.map((item, itemIndex) => (
            <li
              key={item}
              id={`${listId}-${itemIndex}`}
              role="option"
              aria-selected={itemIndex === index}
              className={`cursor-pointer px-4 py-2 text-sm ${itemIndex === index ? "bg-background" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(item);
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
