import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth and tree pages read the session and database on every request.
  serverExternalPackages: ["@neondatabase/serverless", "ws"],
  async headers() {
    return [
      {
        source: "/v/:code",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
