export const PUBLIC_TAG_PATTERN = /^[a-z0-9-]{3,40}$/;

/** Paths the app already owns. A public tag must not use one of these. */
export const RESERVED_SLUGS = new Set([
  "about",
  "account",
  "api",
  "dashboard",
  "forgot-password",
  "icon",
  "login",
  "manifest",
  "opengraph-image",
  "photos",
  "reset-password",
  "robots",
  "sign-in",
  "sign-up",
  "signup",
  "t",
  "tree",
  "v",
]);

export function isReservedSlug(value: string): boolean {
  return RESERVED_SLUGS.has(value.trim().toLowerCase());
}

export function normalizePublicTag(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidPublicTag(input: string): boolean {
  const tag = normalizePublicTag(input);
  return PUBLIC_TAG_PATTERN.test(tag) && !isReservedSlug(tag);
}

export type TreeLookupKind = "share_code" | "public_tag" | "invalid";

const SHARE_CODE_INPUT = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/i;

/** UI-only classifier for the splash lookup. An 8-character share-alphabet string is a code. */
export function classifyTreeLookup(input: string): TreeLookupKind {
  const trimmed = input.trim();
  if (isReservedSlug(trimmed)) return "invalid";
  if (trimmed.length === 8 && SHARE_CODE_INPUT.test(trimmed)) return "share_code";
  if (PUBLIC_TAG_PATTERN.test(trimmed.toLowerCase())) return "public_tag";
  return "invalid";
}
