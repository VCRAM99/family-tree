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

export function actionError(error: unknown): string {
  if (error instanceof AuthzError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the form and try again.";
  console.error(error);
  return "Something went wrong. Please try again.";
}
