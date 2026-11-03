import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth and tree pages read the session and database on every request.
  serverExternalPackages: ["@neondatabase/serverless", "ws"],
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
