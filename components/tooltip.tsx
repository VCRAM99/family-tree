import type { ReactNode } from "react";

type TooltipProps = {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
};

export function Tooltip({ content, children, side = "top", className = "" }: TooltipProps) {
  const position =
    side === "bottom"
      ? "top-[calc(100%+8px)]"
      : "bottom-[calc(100%+8px)]";

  return (
    <span className={`group/tip relative inline-flex max-w-full ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-40 w-max max-w-56 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1 text-center text-xs leading-snug text-text opacity-0 shadow-sm transition duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${position}`}
      >
        {content}
      </span>
    </span>
  );
}
