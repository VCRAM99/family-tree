import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withTestDatabase } from "./helpers/db";

describe("migrations", () => {
  it("applies the schema, indexes, and integrity triggers", async () => {
    await withTestDatabase(async (db) => {
      const tables = await db.execute<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public'
        order by table_name
      `);
      const names = tables.rows.map((row) => row.table_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "user",
          "session",
          "account",
          "verification",
          "rate_limit",
          "trees",
          "tree_admins",
          "persons",
          "person_photos",
          "parent_links",
          "unions",
          "suggestions",
          "viewer_identities",
        ]),
      );

      const indexes = await db.execute<{ indexname: string }>(sql`
        select indexname from pg_indexes where schemaname = 'public'
      `);
      const indexNames = indexes.rows.map((row) => row.indexname);
      for (const name of [
        "trees_owner_id_idx",
        "trees_public_tag_lower_uidx",
        "tree_admins_tree_id_idx",
        "persons_tree_id_idx",
        "parent_links_tree_id_idx",
        "parent_links_parent_id_idx",
        "parent_links_child_id_idx",
        "unions_tree_id_idx",
        "unions_person_a_id_idx",
        "unions_person_b_id_idx",
        "suggestions_tree_id_idx",
        "viewer_identities_tree_id_idx",
      ]) {
        expect(indexNames).toContain(name);
      }

      const triggers = await db.execute<{ tgname: string }>(sql`
        select tgname from pg_trigger where not tgisinternal
      `);
      const triggerNames = triggers.rows.map((row) => row.tgname);
      expect(triggerNames).toEqual(
        expect.arrayContaining([
          "parent_links_reject_cycle_trg",
          "parent_links_same_tree_trg",
          "unions_same_tree_trg",
        ]),
      );
    });
  });
});
