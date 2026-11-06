import { ImageResponse } from "next/og";

import { TreeGlyph } from "@/components/tree-glyph";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<TreeGlyph size={32} />, { ...size });
}
