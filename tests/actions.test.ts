import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { treeAdmins, trees } from "@/lib/db/schema";
import { createPerson } from "@/lib/server/persons";
import { createSuggestion } from "@/lib/server/suggestions";
import { createTree } from "@/lib/server/trees";
import type { SettingsInput } from "@/lib/validation";

import { withTestDatabase } from "./helpers/db";

const requireUser = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/server/session", () => ({
  requireUser: () => requireUser(),
}));

import { deleteTreeAction } from "@/app/dashboard/actions";
import { inviteAdminAction, saveSettingsAction } from "@/app/tree/[id]/settings/actions";
import { rejectSuggestionAction } from "@/app/tree/[id]/suggestions/actions";
import { deletePersonAction, linkPeopleAction, readTreeAction, updatePersonAction } from "@/app/tree/[id]/actions";
import { suggestAction } from "@/app/view-actions";

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

describe("tree server actions", () => {
  beforeEach(() => {
    requireUser.mockReset();
  });

  it.each(cases)("$role $action is allowed=$allow", async ({ role, action, allow }) => {
    await withTestDatabase(async (db) => {
      const ids = await seed(db);
      if (role === "signedOut") requireUser.mockRejectedValue(new Error("redirect"));
      else requireUser.mockResolvedValue({ id: ids[role], name: role, email: `${role}@example.com` });
      const call = run(ids, action);
      if (role === "signedOut") {
        await expect(call).rejects.toThrow(/redirect/);
        return;
      }
      const result = await call;
      if (allow) expect(result).not.toMatchObject({ error: expect.any(String) });
      else expect(result).toMatchObject({ error: expect.any(String) });
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
  const tree = await createTree(owner, "owner@example.com", { name: "Kin" });
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

function run(ids: Awaited<ReturnType<typeof seed>>, action: Action) {
  if (action === "read") return readTreeAction(ids.treeId);
  if (action === "edit") return updatePersonAction(ids.treeId, ids.personId, { firstName: "Edited" });
  if (action === "deletePerson") return deletePersonAction(ids.treeId, ids.otherId);
  if (action === "link") return linkPeopleAction(ids.treeId, { kind: "father", parentId: ids.personId, childId: ids.otherId });
  if (action === "deleteTree") return deleteTreeAction(ids.treeId, ids.treeName);
  if (action === "visibility") return saveSettingsAction(ids.treeId, settings(ids));
  if (action === "admins") return inviteAdminAction(ids.treeId, `invite-${ids.treeId.slice(0, 8)}@example.com`);
  if (action === "review") return rejectSuggestionAction(ids.treeId, ids.suggestionId);
  return suggestAction(ids.treeId, { type: "new_person", payload: { firstName: "Later" } });
}

function settings(ids: { treeName: string; treeId: string }): SettingsInput {
  return {
    name: ids.treeName,
    description: "",
    visibility: "public",
    publicTag: `family-${ids.treeId.slice(0, 8)}`,
    allowSuggestions: true,
    socialsEnabled: false,
    photosEnabled: false,
    hideLivingDetails: true,
    notifySuggestions: true,
    visibleFields: [],
    theme: "system",
    customFieldDefs: [],
  };
}
