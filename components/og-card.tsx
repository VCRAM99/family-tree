import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function ogCard(title: string, detail: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#f6f4f0",
          color: "#1c1917",
          padding: 72,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: "#6f6a63" }}>Family Tree</div>
        <div style={{ marginTop: 24, fontSize: 84, lineHeight: 1, maxWidth: 980 }}>{title}</div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#6f6a63" }}>{detail}</div>
      </div>
    ),
    { ...ogSize },
  );
}
