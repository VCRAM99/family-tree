import { isReservedSlug, isValidPublicTag, normalizePublicTag } from "@/lib/public-tag";
import { isShareCode } from "@/lib/share-code";

export type SlugKind = "share_code" | "public_tag" | "reserved" | "invalid";

/** Uppercase share codes are codes. Anything else that is a legal tag is a public tag. */
export function resolveSlug(slug: string): SlugKind {
  const value = slug.trim();
  if (!value || value.includes("/")) return "invalid";
  if (isReservedSlug(value)) return "reserved";
  if (isShareCode(value)) return "share_code";
  if (isValidPublicTag(value)) return "public_tag";
  return "invalid";
}

export function viewerPath(slug: string): string {
  return `/${slug}`;
}

export function legacyCodePath(code: string): string {
  return `/${code.trim().toUpperCase()}`;
}

export function legacyTagPath(tag: string): string {
  return `/${normalizePublicTag(tag)}`;
}
