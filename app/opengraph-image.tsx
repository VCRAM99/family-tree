import { ogCard, ogContentType, ogSize } from "@/components/og-card";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Family Tree";

export default function OpenGraphImage() {
  return ogCard("The people who made you.", "A private family archive");
}
