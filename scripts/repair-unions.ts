import pg from "pg";

// Node's type stripper needs the .ts extension; the app compiler does not.
// @ts-expect-error TS5097
import { planUnionRepair, type RepairLink, type RepairUnion } from "../lib/union-repair.ts";

const apply = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });

try {
  const links = await pool.query<RepairLink>(
    `select id, tree_id as "treeId", parent_id as "parentId", child_id as "childId", union_id as "unionId" from parent_links`,
  );
  const unions = await pool.query<RepairUnion>(
    `select id, tree_id as "treeId", person_a_id as "personAId", person_b_id as "personBId" from unions`,
  );
  const plan = planUnionRepair(links.rows, unions.rows);
  console.log(apply ? "Applying union repair" : "Dry run (pass --apply to write)");
  console.log(`Unions to create: ${plan.create.length}`);
  console.log(`Parent links to backfill: ${plan.backfill.length}`);

  if (!apply) {
    console.log("No rows written.");
  } else {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const item of plan.create) {
        const inserted = await client.query<{ id: string }>(
          `insert into unions (tree_id, person_a_id, person_b_id, status, sort_order)
           values ($1, $2, $3, 'married', 0)
           returning id`,
          [item.treeId, item.personAId, item.personBId],
        );
        const unionId = inserted.rows[0]?.id;
        if (!unionId) throw new Error("Could not create a union.");
        await client.query(`update parent_links set union_id = $1, updated_at = now() where id = any($2::uuid[])`, [unionId, item.linkIds]);
      }
      for (const item of plan.backfill) {
        await client.query(`update parent_links set union_id = $1, updated_at = now() where id = $2 and union_id is null`, [item.unionId, item.linkId]);
      }
      await client.query("commit");
      console.log("Wrote the repair.");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
