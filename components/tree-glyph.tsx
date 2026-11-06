export function TreeGlyph({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2c4a3e",
        borderRadius: size > 64 ? 36 : 8,
      }}
    >
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 32 32">
        <path
          d="M16 28 V14 M16 20 C11 20 8 16 6 11 M6 11 C5 7 8 5 11 6 M16 18 C21 18 24 14 26 9 M26 9 C27 5 24 4 21 5"
          fill="none"
          stroke="#fffcf8"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
