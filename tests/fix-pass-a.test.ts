import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { user } from "@/lib/db/auth-schema";
import { trees } from "@/lib/db/schema";
import { assertServerEnv } from "@/lib/env";
import { createGraphIndex, orderingYear, type GraphPerson, type TreeGraph } from "@/lib/family-graph";
import { brandedEmail } from "@/lib/server/email-templates";
import { sendEmail } from "@/lib/server/email";
import { getPublicTreeByTag, getTreeByCode } from "@/lib/server/public-tree";
import { createTree, updateTreeSettings } from "@/lib/server/trees";
import { isProtectedPath, safeNextPath } from "@/lib/paths";
import { isValidPublicTag } from "@/lib/public-tag";
import { resolvedPublicTag, settingsSchema, uniqueVisibleFields } from "@/lib/validation";
import { legacyCodePath, legacyTagPath, resolveSlug } from "@/lib/viewer-url";
import { withTestDatabase } from "./helpers/db";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("email templates and delivery", () => {
  it("keeps the full URL in text and a short link in HTML", () => {
    const href = "https://familytree.varunsr.com/verify?token=very-long-token";
    const mail = brandedEmail({
      subject: "Verify",
      eyebrow: "Family Tree",
      title: "Verify your email",
      paragraphs: ["Use the button."],
      action: { label: "Verify", href },
    });
    expect(mail.text).toContain(href);
    expect(mail.html).toContain("Open this link");
    expect(mail.html).not.toContain(`>${href}<`);
  });

  it("refuses to print a message when production has no Resend key", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmail({ to: "ada@example.com", subject: "Hello", text: "https://secret.example/token" })).rejects.toMatchObject({
      name: "MissingApiKey",
    });
    expect(info.mock.calls.flat().join(" ")).not.toContain("secret.example");
    expect(info.mock.calls.flat().join(" ")).not.toContain("ada@example.com");
  });

  it("fails startup in production when the mail key is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://local");
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://local");
    vi.stubEnv("BETTER_AUTH_SECRET", "0123456789abcdef");
    vi.stubEnv("BETTER_AUTH_URL", "https://familytree.varunsr.com");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(() => assertServerEnv()).toThrow(/RESEND_API_KEY/);
  });
});

describe("viewer URLs", () => {
  it("treats an uppercase share code as a code and anything else legal as a tag", () => {
    expect(resolveSlug("23456789")).toBe("share_code");
    expect(resolveSlug("family")).toBe("public_tag");
    expect(resolveSlug("dashboard")).toBe("reserved");
    expect(resolveSlug("no")).toBe("invalid");
    expect(isValidPublicTag("dashboard")).toBe(false);
    expect(() => resolvedPublicTag("public", "dashboard")).toThrow(/reserved/i);
    expect(legacyCodePath("23456789")).toBe("/23456789");
    expect(legacyTagPath("Family")).toBe("/family");
  });

  it("leaves viewer paths open and keeps suggestion sign-in on the same page", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/tree/abc")).toBe(true);
    expect(isProtectedPath("/23456789")).toBe(false);
    expect(isProtectedPath("/family")).toBe(false);
    expect(safeNextPath("/23456789")).toBe("/23456789");
    expect(safeNextPath("/family")).toBe("/family");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
  });

  it("resolves public and unlisted trees for a signed-out viewer and never a private tree", async () => {
    await withTestDatabase(async (db) => {
      const owner = crypto.randomUUID();
      await db.insert(user).values({ id: owner, name: "Owner", email: "owner-pass-a@example.com", emailVerified: true });
      const tree = await createTree(owner, "owner-pass-a@example.com", { name: "Open" });
      await updateTreeSettings(owner, tree.id, {
        name: "Open",
        description: "",
        visibility: "public",
        publicTag: "open-family",
        allowSuggestions: true,
        socialsEnabled: true,
        photosEnabled: true,
        hideLivingDetails: false,
        notifySuggestions: false,
        visibleFields: [],
        theme: "system",
        autosave: true,
        customFieldDefs: [],
      });
      expect((await getPublicTreeByTag("open-family", "pass-a-public"))?.summary.name).toBe("Open");

      await updateTreeSettings(owner, tree.id, {
        name: "Open",
        description: "",
        visibility: "unlisted",
        publicTag: "",
        allowSuggestions: true,
        socialsEnabled: true,
        photosEnabled: true,
        hideLivingDetails: false,
        notifySuggestions: false,
        visibleFields: [],
        theme: "system",
        autosave: false,
        customFieldDefs: [],
      });
      const [row] = await db.select({ shareCode: trees.shareCode }).from(trees).where(eq(trees.id, tree.id));
      expect((await getTreeByCode(row!.shareCode, "pass-a-code"))?.summary.visibility).toBe("unlisted");
      expect(await getPublicTreeByTag("open-family", "pass-a-gone")).toBeNull();

      await updateTreeSettings(owner, tree.id, {
        name: "Open",
        description: "",
        visibility: "private",
        publicTag: "",
        allowSuggestions: false,
        socialsEnabled: true,
        photosEnabled: true,
        hideLivingDetails: false,
        notifySuggestions: false,
        visibleFields: [],
        theme: "system",
        autosave: true,
        customFieldDefs: [],
      });
      expect(await getTreeByCode(row!.shareCode, "pass-a-private")).toBeNull();
      expect(await getPublicTreeByTag("open-family", "pass-a-private-tag")).toBeNull();
    });
  });
});

describe("visible fields and ordering estimates", () => {
  it("keeps at most two visible fields", () => {
    expect(uniqueVisibleFields(["bio", "email", "occupation", "bio"])).toEqual(["bio", "email"]);
    const parsed = settingsSchema.safeParse({
      name: "Tree",
      description: "",
      visibility: "private",
      publicTag: "",
      allowSuggestions: false,
      socialsEnabled: false,
      photosEnabled: false,
      hideLivingDetails: false,
      notifySuggestions: false,
      visibleFields: ["bio", "email", "occupation"],
      theme: "system",
      customFieldDefs: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("estimates a missing birth year from a child, for ordering only", () => {
    const person = (id: string, birthDate: string | null): GraphPerson => ({
      id,
      treeId: "tree",
      firstName: id,
      middleName: null,
      lastName: null,
      preferredName: null,
      birthSurname: null,
      sex: "unknown",
      birthDate,
      birthDatePrecision: birthDate ? "exact" : null,
      deathDate: null,
      deathDatePrecision: null,
      isDeceased: false,
      birthPlace: null,
      nativePlace: null,
      currentLocation: null,
      occupation: null,
      bio: null,
      hasPhoto: false,
      phoneWhatsapp: null,
      email: null,
      instagram: null,
      facebook: null,
      customFields: {},
    });
    const graph: TreeGraph = {
      persons: [person("parent", null), person("child", "2000-01-01")],
      parentLinks: [{ id: "link", parentId: "parent", childId: "child", kind: "biological", unionId: null }],
      unions: [],
    };
    expect(orderingYear(createGraphIndex(graph), "parent")).toBe(1975);
  });
});
