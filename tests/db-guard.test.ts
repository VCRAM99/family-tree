import { describe, expect, it } from "vitest";

import { databaseTargetError } from "../scripts/db-guard.mjs";
import { assertLocalDatabaseEnv } from "./helpers/local-db";

describe("database guards", () => {
  it("rejects a remote database URL before tests can connect", () => {
    expect(() => assertLocalDatabaseEnv({ DATABASE_URL: "postgres://owner:secret@ep-prod.neon.tech/neondb" })).toThrow(/ep-prod.neon.tech/);
    expect(() => assertLocalDatabaseEnv({ DATABASE_URL_UNPOOLED: "postgres://owner:secret@example.com/neondb" })).toThrow(/example.com/);
    expect(() => assertLocalDatabaseEnv({})).not.toThrow();
    expect(() => assertLocalDatabaseEnv({ DATABASE_URL: "postgres://owner:secret@127.0.0.1:5432/neondb" })).not.toThrow();
  });

  it("refuses protected hosts and production migrate unless the flag is present", () => {
    const url = "postgres://owner:secret@ep-prod.neon.tech/neondb";
    expect(databaseTargetError(url, { protectedHosts: "ep-prod.neon.tech", argv: [], lifecycle: "" })).toMatch(/protected host/);
    expect(databaseTargetError(url, { protectedHosts: "ep-prod.neon.tech", argv: ["--i-know-this-is-production"], lifecycle: "" })).toBeNull();
    expect(databaseTargetError(url, { protectedHosts: "", argv: [], lifecycle: "db:migrate:prod" })).toMatch(/db:migrate:prod/);
    expect(
      databaseTargetError(url, { protectedHosts: "ep-prod.neon.tech", argv: ["--i-know-this-is-production"], lifecycle: "db:migrate:prod" }),
    ).toBeNull();
    expect(databaseTargetError("postgres://owner:secret@localhost/family", { protectedHosts: "ep-prod.neon.tech", argv: [], lifecycle: "" })).toBeNull();
  });
});
