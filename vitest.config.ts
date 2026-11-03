import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "tests/stubs/server-only.ts"),
    },
  },
});
