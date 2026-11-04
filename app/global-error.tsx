"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f6f4f0", color: "#1c1917", fontFamily: "Georgia, serif" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "96px 24px" }}>
          <h1 style={{ fontSize: 56, fontWeight: 400, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#6f6a63", lineHeight: 1.6 }}>The archive could not be opened.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 28, background: "#2c4a3e", color: "#fffcf8", border: 0, borderRadius: 999, padding: "12px 20px" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
