import pg from "pg";

import { assertSafeDatabaseTarget } from "./db-guard.mjs";

const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function shareCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let code = "";
  for (const byte of bytes) {
    if (code.length === 8) break;
    if (byte >= 256 - (256 % alphabet.length)) continue;
    code += alphabet[byte % alphabet.length];
  }
  return code.padEnd(8, "2").slice(0, 8);
}

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is not set.");
  process.exit(1);
}
assertSafeDatabaseTarget(connectionString);
const pool = new pg.Pool({ connectionString });

try {
  const email = process.argv[2];
  const userResult = email
    ? await pool.query<{ id: string; email: string }>("select id, email from \"user\" where lower(email) = lower($1) limit 1", [email])
    : await pool.query<{ id: string; email: string }>("select id, email from \"user\" order by created_at limit 1");
  const owner = userResult.rows[0];
  if (!owner) throw new Error("No user found. Pass an email: node scripts/generate-large-tree.ts you@example.com");

  const existing = await pool.query<{ id: string }>("select id from trees where owner_id = $1 and name = 'Synthetic 2000' limit 1", [owner.id]);
  if (existing.rows[0] && process.argv[3] !== "--force") {
    console.log(`Synthetic 2000 already exists: /tree/${existing.rows[0].id}?view=tree`);
    console.log("Pass --force to replace its people.");
  } else {
    const client = await pool.connect();
    try {
      await client.query("begin");
      let treeId = existing.rows[0]?.id;
      if (treeId) {
        await client.query("delete from persons where tree_id = $1", [treeId]);
      } else {
        const inserted = await client.query<{ id: string }>(
          `insert into trees (owner_id, name, description, share_code)
           values ($1, 'Synthetic 2000', 'Generated for diagram performance checks.', $2)
           returning id`,
          [owner.id, shareCode()],
        );
        treeId = inserted.rows[0]?.id;
        if (!treeId) throw new Error("Could not create the tree.");
        await client.query(
          `insert into tree_admins (tree_id, user_id, invited_email, role, status)
           values ($1, $2, $3, 'owner', 'accepted')`,
          [treeId, owner.id, owner.email],
        );
      }

      const people: { id: string; sex: "male" | "female"; year: number }[] = [];
      const unions: { id: string; a: string; b: string; sort: number }[] = [];
      const links: { parent: string; child: string; union: string }[] = [];
      const add = (sex: "male" | "female", year: number) => {
        const id = crypto.randomUUID();
        people.push({ id, sex, year });
        return id;
      };
      let cohort = [add("male", 1700), add("female", 1701), add("male", 1702), add("female", 1703)];
      unions.push({ id: crypto.randomUUID(), a: cohort[0]!, b: cohort[1]!, sort: 0 });
      unions.push({ id: crypto.randomUUID(), a: cohort[2]!, b: cohort[3]!, sort: 0 });
      let year = 1725;
      let guard = 0;
      while (people.length < 2000 && cohort.length >= 2 && guard < 40) {
        guard += 1;
        const next: string[] = [];
        for (let index = 0; index + 1 < cohort.length && people.length < 2000; index += 2) {
          const left = cohort[index];
          const right = cohort[index + 1];
          if (!left || !right) break;
          let union = unions.find((item) => (item.a === left && item.b === right) || (item.a === right && item.b === left));
          if (!union) {
            union = { id: crypto.randomUUID(), a: left, b: right, sort: 0 };
            unions.push(union);
          }
          for (let childIndex = 0; childIndex < 3 && people.length < 2000; childIndex += 1) {
            const child = add(childIndex % 2 === 0 ? "female" : "male", year + childIndex);
            links.push({ parent: left, child, union: union.id });
            links.push({ parent: right, child, union: union.id });
            next.push(child);
          }
          if (people.length < 1998 && index % 6 === 0) {
            const extra = add("female", year + 4);
            const second = { id: crypto.randomUUID(), a: left, b: extra, sort: 1 };
            unions.push(second);
            const child = add("male", year + 5);
            links.push({ parent: left, child, union: second.id });
            links.push({ parent: extra, child, union: second.id });
            next.push(extra, child);
          }
        }
        if (next.length >= 4) {
          const cousinA = next[0];
          const cousinB = next[3];
          if (cousinA && cousinB && cousinA !== cousinB) {
            unions.push({ id: crypto.randomUUID(), a: cousinA, b: cousinB, sort: 0 });
          }
        }
        cohort = next;
        year += 25;
      }

      for (let offset = 0; offset < people.length; offset += 200) {
        const slice = people.slice(offset, offset + 200);
        const values: unknown[] = [];
        const rows = slice.map((person, index) => {
          const base = index * 5;
          values.push(person.id, treeId, `Person ${offset + index + 1}`, person.sex, `${person.year}-01-01`);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'exact')`;
        });
        await client.query(
          `insert into persons (id, tree_id, first_name, sex, birth_date, birth_date_precision) values ${rows.join(",")}`,
          values,
        );
      }
      for (let offset = 0; offset < unions.length; offset += 200) {
        const slice = unions.slice(offset, offset + 200);
        const values: unknown[] = [];
        const rows = slice.map((union, index) => {
          const base = index * 5;
          values.push(union.id, treeId, union.a, union.b, union.sort);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        });
        await client.query(
          `insert into unions (id, tree_id, person_a_id, person_b_id, sort_order) values ${rows.join(",")}`,
          values,
        );
      }
      const kept = new Set(people.map((person) => person.id));
      const usable = links.filter((link) => kept.has(link.parent) && kept.has(link.child));
      for (let offset = 0; offset < usable.length; offset += 300) {
        const slice = usable.slice(offset, offset + 300);
        const values: unknown[] = [];
        const rows = slice.map((link, index) => {
          const base = index * 4;
          values.push(treeId, link.parent, link.child, link.union);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
        });
        await client.query(
          `insert into parent_links (tree_id, parent_id, child_id, union_id) values ${rows.join(",")}`,
          values,
        );
      }
      await client.query("commit");
      console.log(`Seeded ${people.length} people, ${unions.length} unions, ${usable.length} parent links.`);
      console.log(`/tree/${treeId}?view=tree`);
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
