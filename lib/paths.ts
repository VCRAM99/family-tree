export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/dashboard") || value.startsWith("/tree/") || value.startsWith("/t/") || value.startsWith("/v/")) return value;
  return "/dashboard";
}
