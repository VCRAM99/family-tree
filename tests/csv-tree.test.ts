import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSignature, previewCsv, templateCsv } from "@/lib/csv-tree";
import { user } from "@/lib/db/auth-schema";
import { trees } from "@/lib/db/schema";
import { exportTreeCsv, importCsvTree } from "@/lib/server/csv-import";

import { withTestDatabase } from "./helpers/db";

const header =
  "ref,first_name,middle_name,last_name,preferred_name,birth_surname,sex,birth_date,death_date,is_deceased,birth_place,native_place,current_location,occupation,bio,father_ref,mother_ref,spouse_refs,phone_whatsapp,email,instagram,facebook";

function line(values: Record<string, string>): string {
  const columns = header.split(",");
  return columns.map((column) => values[column] ?? "").join(",");
}

describe("csv trees", () => {
  it("round-trips the template into the same graph", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "csv@example.com", emailVerified: true });
      const template = templateCsv();
      const before = previewCsv(template);
      expect(before.errors).toEqual([]);
      const created = await importCsvTree(owner, "csv@example.com", template, "Template");
      const exported = await exportTreeCsv(owner, created.id);
      const after = previewCsv(exported);
      expect(after.errors).toEqual([]);
      expect(planSignature(after)).toBe(planSignature(before));
      const again = await importCsvTree(owner, "csv@example.com", exported, "Template copy");
      const rows = await db.select().from(trees).where(eq(trees.ownerId, owner));
      expect(rows.map((tree) => tree.id).sort()).toEqual([created.id, again.id].sort());
    });
  });

  it("reports unknown refs, bad dates, and ancestry cycles", () => {
    const unknown = previewCsv(`${header}\n${line({ ref: "1", first_name: "Ada", sex: "female", father_ref: "9" })}`);
    expect(unknown.errors.some((error) => error.message.includes("father_ref 9"))).toBe(true);

    const dated = previewCsv(`${header}\n${line({ ref: "1", first_name: "Ada", sex: "female", birth_date: "1815-13-40" })}`);
    expect(dated.errors.some((error) => error.message.includes("not a real date"))).toBe(true);

    const cycle = previewCsv(
      `${header}\n${line({ ref: "1", first_name: "Ada", sex: "female", father_ref: "2" })}\n${line({ ref: "2", first_name: "Bea", sex: "male", father_ref: "1" })}`,
    );
    expect(cycle.errors.some((error) => error.message.includes("ancestry cycle"))).toBe(true);
    expect(cycle.links).toEqual([]);
  });

  it("infers a couple from parents and from spouse refs", () => {
    const parents = previewCsv(
      `${header}\n${[
        line({ ref: "1", first_name: "Ada", sex: "female" }),
        line({ ref: "2", first_name: "Ben", sex: "male" }),
        line({ ref: "3", first_name: "Cy", sex: "male", father_ref: "2", mother_ref: "1" }),
      ].join("\n")}`,
    );
    expect(parents.errors).toEqual([]);
    expect(parents.unions).toEqual([{ a: "1", b: "2" }]);
    expect(parents.links).toEqual([
      { parentRef: "2", childRef: "3" },
      { parentRef: "1", childRef: "3" },
    ]);

    const spouses = previewCsv(
      `${header}\n${[
        line({ ref: "1", first_name: "Ada", sex: "female", spouse_refs: "2;4" }),
        line({ ref: "2", first_name: "Ben", sex: "male" }),
        line({ ref: "4", first_name: "Dee", sex: "female" }),
      ].join("\n")}`,
    );
    expect(spouses.errors).toEqual([]);
    expect(spouses.unions).toEqual([
      { a: "1", b: "2" },
      { a: "1", b: "4" },
    ]);
  });
});
