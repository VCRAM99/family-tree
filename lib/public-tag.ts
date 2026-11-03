export const PUBLIC_TAG_PATTERN = /^[a-z0-9-]{3,40}$/;

export function normalizePublicTag(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidPublicTag(input: string): boolean {
  return PUBLIC_TAG_PATTERN.test(normalizePublicTag(input));
}

export type TreeLookupKind = "share_code" | "public_tag" | "invalid";

const SHARE_CODE_INPUT = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/i;

/** UI-only classifier for the splash lookup. An 8-character share-alphabet string is a code. */
export function classifyTreeLookup(input: string): TreeLookupKind {
  const trimmed = input.trim();
  if (trimmed.length === 8 && SHARE_CODE_INPUT.test(trimmed)) return "share_code";
  if (PUBLIC_TAG_PATTERN.test(trimmed.toLowerCase())) return "public_tag";
  return "invalid";
}
