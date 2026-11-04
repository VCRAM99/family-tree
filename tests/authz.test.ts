import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { treeAdmins, trees } from "@/lib/db/schema";
import { deletePerson, linkPeople, updatePerson } from "@/lib/server/person-writes";
import { createPerson } from "@/lib/server/persons";
import { createSuggestion, rejectSuggestion } from "@/lib/server/suggestions";
import { readViewerIdentity, setViewerIdentity } from "@/lib/server/viewer-identity";
import { changeTreeVisibility, createTree, deleteTree, inviteTreeAdmin, readTree } from "@/lib/server/trees";

import { withTestDatabase } from "./helpers/db";

const roles = ["owner", "admin", "pending", "stranger", "signedOut"] as const;
const actions = ["read", "edit", "deletePerson", "link", "deleteTree", "visibility", "admins", "review", "suggest"] as const;

type Role = (typeof roles)[number];
type Action = (typeof actions)[number];

const allowed: Record<Action, readonly Role[]> = {
  read: ["owner", "admin"],
  edit: ["owner", "admin"],
  deletePerson: ["owner", "admin"],
  link: ["owner", "admin"],
  deleteTree: ["owner"],
  visibility: ["owner"],
  admins: ["owner"],
  review: ["owner", "admin"],
  suggest: ["owner", "admin", "pending", "stranger"],
};

const cases = roles.flatMap((role) => actions.map((action) => ({ role, action, allow: allowed[action].includes(role) })));

describe("authorization", () => {
  it.each(cases)("$role $action is allowed=$allow", async ({ role, action, allow }) => {
    await withTestDatabase(async (db) => {
      const ids = await seed(db);
      const userId = role === "signedOut" ? null : ids[role];
      const call = Promise.resolve(run(userId, ids, action)).then(() => true);
      if (allow) await expect(call).resolves.toBe(true);
      else await expect(call).rejects.toMatchObject({ code: role === "signedOut" ? "unauthenticated" : "forbidden" });
      if (allow && action === "deleteTree") {
        await expect(readTree(ids.owner, ids.treeId)).rejects.toMatchObject({ code: "forbidden" });
      }
    });
  });

  it.each(roles.filter((role) => role !== "signedOut"))("suggestions off rejects %s", async (role) => {
    await withTestDatabase(async (db) => {
      const ids = await seed(db);
      await db.update(trees).set({ allowSuggestions: false }).where(eq(trees.id, ids.treeId));
      await expect(createSuggestion(ids[role], ids.treeId, { type: "new_person", payload: { firstName: "No" } })).rejects.toMatchObject({
        code: "forbidden",
      });
    });
  });

  it("keeps viewer identity per account", async () => {
    await withTestDatabase(async (db) => {
      const ids = await seed(db);
      await setViewerIdentity(ids.stranger, ids.treeId, ids.personId);
      await setViewerIdentity(ids.owner, ids.treeId, ids.otherId);
      await expect(readViewerIdentity(ids.stranger, ids.treeId)).resolves.toMatchObject({ personId: ids.personId });
      await expect(readViewerIdentity(ids.owner, ids.treeId)).resolves.toMatchObject({ personId: ids.otherId });
    });
  });
});

async function seed(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0]) {
  async function makeUser(email: string) {
    const id = crypto.randomUUID();
    await db.insert(user).values({ id, name: email, email, emailVerified: true });
    return id;
  }
  const owner = await makeUser("owner@example.com");
  const admin = await makeUser("admin@example.com");
  const pending = await makeUser("pending@example.com");
  const stranger = await makeUser("stranger@example.com");
  const tree = await createTree(owner, "owner@example.com", { name: "Ramanathan" });
  await db.insert(treeAdmins).values([
    { treeId: tree.id, userId: admin, invitedEmail: "admin@example.com", role: "admin", status: "accepted" },
    { treeId: tree.id, userId: pending, invitedEmail: "pending@example.com", role: "admin", status: "pending" },
  ]);
  await db.update(trees).set({ allowSuggestions: true }).where(eq(trees.id, tree.id));
  const person = await createPerson(owner, tree.id, { firstName: "Ada" });
  const other = await createPerson(owner, tree.id, { firstName: "Bea" });
  const suggestion = await createSuggestion(owner, tree.id, { type: "new_person", payload: { firstName: "Suggested" } });
  return { owner, admin, pending, stranger, treeId: tree.id, treeName: tree.name, personId: person.id, otherId: other.id, suggestionId: suggestion.id };
}

function run(userId: string | null, ids: Awaited<ReturnType<typeof seed>>, action: Action) {
  if (action === "read") return readTree(userId, ids.treeId);
  if (action === "edit") return updatePerson(userId, ids.treeId, ids.personId, { firstName: "Edited" });
  if (action === "deletePerson") return deletePerson(userId, ids.treeId, ids.otherId);
  if (action === "link") return linkPeople(userId, ids.treeId, { kind: "father", parentId: ids.personId, childId: ids.otherId });
  if (action === "deleteTree") return deleteTree(userId, ids.treeId, ids.treeName);
  if (action === "visibility") return changeTreeVisibility(userId, ids.treeId, "public", `family-${ids.treeId.slice(0, 8)}`);
  if (action === "admins") return inviteTreeAdmin(userId, ids.treeId, `new-${ids.treeId.slice(0, 8)}@example.com`).then(() => true);
  if (action === "review") return rejectSuggestion(userId, ids.treeId, ids.suggestionId);
  return createSuggestion(userId, ids.treeId, { type: "new_person", payload: { firstName: "Later" } });
}
