import { ImageResponse } from "next/og";

import { TreeGlyph } from "@/components/tree-glyph";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<TreeGlyph size={180} />, { ...size });
}
