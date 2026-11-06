"use client";

import { Button } from "@/components/button";

export function SaveFab({
  icon,
  tooltip,
  disabled,
  onClick,
}: {
  icon: "check" | "spinner" | "floppy";
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="fixed right-4 bottom-4 z-40">
      <Button
        tooltip={tooltip}
        tooltipSide="top"
        disabled={disabled}
        onClick={onClick}
        variant="secondary"
        className={`h-12 w-12 px-0 shadow-sm ${icon === "check" ? "bg-add text-surface" : ""}`}
      >
        {icon === "spinner" ? <Spinner /> : icon === "check" ? <Check /> : <Floppy />}
      </Button>
    </div>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 9.5 L7.5 13 L14 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Floppy() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 3.5 H12.5 L14.5 5.5 V14.5 H4 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 3.5 V7 H11.5 V3.5 M6.5 14.5 V10.5 H11.5 V14.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
