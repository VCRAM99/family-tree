import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { persons, trees } from "@/lib/db/schema";
import type { GraphPerson } from "@/lib/family-graph";
import { createTree } from "@/lib/server/trees";
import {
  PUBLIC_PERSON_KEYS,
  consumeLookup,
  getPublicTreeByTag,
  getTreeByCode,
  listPublicPersons,
  publicPhotoAllowed,
  sanitizePublicPerson,
  searchPublicTrees,
} from "@/lib/server/public-tree";

import { withTestDatabase } from "./helpers/db";

function source(patch: Partial<GraphPerson> = {}): GraphPerson {
  return {
    id: "person",
    treeId: "tree",
    firstName: "Asha",
    middleName: null,
    lastName: "Ramanathan",
    preferredName: null,
    birthSurname: null,
    sex: "female",
    birthDate: "1968-01-01",
    birthDatePrecision: "exact",
    deathDate: null,
    deathDatePrecision: null,
    isDeceased: false,
    birthPlace: "Chennai",
    nativePlace: "Soorakudi",
    currentLocation: "Austin",
    occupation: "Teacher",
    bio: "A long life.",
    hasPhoto: true,
    phoneWhatsapp: "+1 555 0100",
    email: "asha@example.com",
    instagram: "asha",
    facebook: "asha",
    customFields: { note: "private" },
    ...patch,
  };
}

const openPolicy = {
  hideLivingDetails: false,
  socialsEnabled: true,
  photosEnabled: true,
  visibleFields: ["sex", "birth_date", "death_date", "birth_place", "native_place", "current_location", "occupation", "bio"],
};

describe("public sanitizer", () => {
  it("hides a living person down to their name", () => {
    const view = sanitizePublicPerson(source(), { ...openPolicy, hideLivingDetails: true });
    expect(view.livingOnly).toBe(true);
    expect(view.firstName).toBe("Asha");
    expect(view.birthDate).toBeNull();
    expect(view.birthPlace).toBeNull();
    expect(view.bio).toBeNull();
    expect(view.hasPhoto).toBe(false);
    expect(view.email).toBeNull();
    expect(view.customFields).toEqual({});
  });

  it("drops contacts when socials are off", () => {
    const view = sanitizePublicPerson(source({ isDeceased: true, deathDate: "2020-01-01", deathDatePrecision: "year" }), {
      ...openPolicy,
      socialsEnabled: false,
    });
    expect(view.email).toBeNull();
    expect(view.phoneWhatsapp).toBeNull();
    expect(view.instagram).toBeNull();
    expect(view.facebook).toBeNull();
    expect(view.bio).toBe("A long life.");
  });

  it("drops photos when photos are off", () => {
    const view = sanitizePublicPerson(source({ isDeceased: true, deathDate: "2020-01-01", deathDatePrecision: "year" }), {
      ...openPolicy,
      photosEnabled: false,
    });
    expect(view.hasPhoto).toBe(false);
  });

  it("omits placeholder people", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "owner-public@example.com", emailVerified: true });
      const tree = await createTree(owner, "owner-public@example.com", { name: "Shown" });
      await db.update(trees).set({ visibility: "public", publicTag: "shown-family" }).where(eq(trees.id, tree.id));
      await db.insert(persons).values([
        { treeId: tree.id, firstName: "Real" },
        { treeId: tree.id, firstName: "Unknown", isPlaceholder: true },
      ]);
      const listed = await listPublicPersons(tree.id);
      expect(listed.map((person) => person.displayName)).toEqual(["Real"]);
    });
  });

  it("exposes only the public person keys", () => {
    const view = sanitizePublicPerson(source(), openPolicy);
    expect(Object.keys(view).sort()).toEqual([...PUBLIC_PERSON_KEYS].sort());
    const dumped = JSON.stringify(view);
    expect(dumped).not.toContain("createdBy");
    expect(dumped).not.toContain("isPlaceholder");
    expect(dumped).not.toContain("owner@");
  });
});

const matrix = [
  { visibility: "private", lookup: "tag", allow: false },
  { visibility: "private", lookup: "code", allow: false },
  { visibility: "private", lookup: "search", allow: false },
  { visibility: "private", lookup: "photo", allow: false },
  { visibility: "unlisted", lookup: "tag", allow: false },
  { visibility: "unlisted", lookup: "code", allow: true },
  { visibility: "unlisted", lookup: "search", allow: false },
  { visibility: "unlisted", lookup: "photo", allow: true },
  { visibility: "public", lookup: "tag", allow: true },
  { visibility: "public", lookup: "code", allow: true },
  { visibility: "public", lookup: "search", allow: true },
  { visibility: "public", lookup: "photo", allow: true },
] as const;

describe("public access matrix", () => {
  it.each(matrix)("$visibility looked up by $lookup is allowed=$allow", async ({ visibility, lookup, allow }) => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      const email = `${visibility}-${lookup}@example.com`;
      await db.insert(user).values({ id: owner, name: "Owner", email, emailVerified: true });
      const tree = await createTree(owner, email, { name: `Family ${visibility} ${lookup}` });
      const tag = visibility === "public" ? `tag-${visibility}-${lookup}` : null;
      await db
        .update(trees)
        .set({
          visibility,
          publicTag: tag,
          photosEnabled: true,
          hideLivingDetails: false,
        })
        .where(eq(trees.id, tree.id));
      const [person] = await db.insert(persons).values({ treeId: tree.id, firstName: "Photo", hasPhoto: true, isDeceased: true }).returning();
      const ip = `${visibility}-${lookup}`;
      let found = false;
      if (lookup === "tag") found = Boolean(await getPublicTreeByTag(tag ?? `missing-${visibility}`, ip));
      if (lookup === "code") found = Boolean(await getTreeByCode(tree.shareCode, ip));
      if (lookup === "search") {
        const hits = await searchPublicTrees(`Family ${visibility} ${lookup}`, ip);
        found = hits.some((hit) => hit.name === `Family ${visibility} ${lookup}`);
      }
      if (lookup === "photo") found = await publicPhotoAllowed(person!.id);
      expect(found).toBe(allow);
    });
  });
});

describe("lookup rate limit", () => {
  it("stops answering after 30 lookups from the same address", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "limit@example.com", emailVerified: true });
      const tree = await createTree(owner, "limit@example.com", { name: "Limited" });
      await db.update(trees).set({ visibility: "public", publicTag: "limited-tree" }).where(eq(trees.id, tree.id));
      const ip = "203.0.113.8";
      for (let attempt = 0; attempt < 30; attempt += 1) {
        expect(await consumeLookup(ip)).toBe(true);
      }
      expect(await getTreeByCode(tree.shareCode, ip)).toBeNull();
      expect(await getPublicTreeByTag("limited-tree", ip)).toBeNull();
      expect(await getTreeByCode("ZZZZZZZZ", ip)).toBeNull();
    });
  });
});
