import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2c4a3e",
          color: "#fffcf8",
          fontSize: 18,
          fontFamily: "Georgia, serif",
        }}
      >
        F
      </div>
    ),
    { ...size },
  );
}
