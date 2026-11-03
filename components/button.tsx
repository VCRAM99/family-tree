import type { ButtonHTMLAttributes } from "react";

import { Tooltip } from "@/components/tooltip";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "add";
  tooltipSide?: "top" | "bottom";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-surface hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-background",
  ghost: "text-muted hover:text-text",
  danger: "bg-danger text-surface hover:opacity-90",
  add: "bg-add text-surface hover:opacity-90",
};

export function Button({
  tooltip,
  variant = "primary",
  tooltipSide = "top",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <Tooltip content={tooltip} side={tooltipSide} className={className.includes("w-full") ? "w-full" : ""}>
      <button
        type={type}
        className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
        {...props}
      />
    </Tooltip>
  );
}
