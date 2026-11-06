import { isReservedSlug } from "@/lib/public-tag";
import { isShareCode } from "@/lib/share-code";

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  const path = value.split("?")[0] ?? value;
  if (path.startsWith("/dashboard") || path.startsWith("/tree/") || path.startsWith("/account") || path.startsWith("/t/") || path.startsWith("/v/")) {
    return value;
  }
  const slug = path.slice(1);
  if (slug && !slug.includes("/") && (isShareCode(slug) || (!isReservedSlug(slug) && /^[a-z0-9-]{3,40}$/i.test(slug)))) return value;
  return "/dashboard";
}

/** Signed-in areas. Viewer URLs at the root stay open. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/tree" || pathname.startsWith("/tree/");
}
