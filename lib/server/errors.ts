import "server-only";

import { ZodError } from "zod";

export type AuthzCode = "unauthenticated" | "forbidden" | "not_found" | "invalid";

export class AuthzError extends Error {
  readonly code: AuthzCode;

  constructor(message: string, code: AuthzCode) {
    super(message);
    this.name = "AuthzError";
    this.code = code;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export function errorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("message" in current && typeof current.message === "string") parts.push(current.message);
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  if (error instanceof Error && !parts.includes(error.message)) parts.push(error.message);
  return parts.join("\n");
}

export function isAncestryCycle(error: unknown): boolean {
  return /ancestor/i.test(errorText(error));
}

export function actionError(error: unknown): string {
  if (isAncestryCycle(error)) return "That would make someone their own ancestor";
  if (error instanceof AuthzError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the form and try again.";
  console.error(error);
  return "Something went wrong. Please try again.";
}
