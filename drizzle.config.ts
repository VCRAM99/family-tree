import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const unpooled = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // generate does not connect. migrate and studio need the direct Neon URL.
    url: unpooled ?? "postgresql://user:password@localhost:5432/family_tree",
  },
});
