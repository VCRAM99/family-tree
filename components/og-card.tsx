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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="42" height="42" viewBox="0 0 32 32">
            <path
              d="M16 28 V14 M16 20 C11 20 8 16 6 11 M6 11 C5 7 8 5 11 6 M16 18 C21 18 24 14 26 9 M26 9 C27 5 24 4 21 5"
              fill="none"
              stroke="#2c4a3e"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: "#6f6a63" }}>Family Tree</div>
        </div>
        <div style={{ marginTop: 24, fontSize: 84, lineHeight: 1, maxWidth: 980 }}>{title}</div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#6f6a63" }}>{detail}</div>
      </div>
    ),
    { ...ogSize },
  );
}
