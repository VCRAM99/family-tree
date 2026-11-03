import { z } from "zod";

import { PERSON_FIELDS, THEME_IDS, type PersonField, type ThemeId } from "@/lib/domain";
import { isValidPublicTag, normalizePublicTag } from "@/lib/public-tag";

export const visibilitySchema = z.enum(["private", "unlisted", "public"]);
export const themeSchema = z.enum(THEME_IDS);
export const personFieldSchema = z.enum(PERSON_FIELDS);
export const suggestionTypeSchema = z.enum(["new_person", "contact_update", "correction"]);

export const treeNameSchema = z.string().trim().min(1, "Give the tree a name.").max(80, "Keep the name under 80 characters.");
export const treeDescriptionSchema = z.string().trim().max(2000, "Keep the description under 2000 characters.");

export const createTreeSchema = z.object({
  name: treeNameSchema,
  description: treeDescriptionSchema,
});

export const settingsSchema = z.object({
  name: treeNameSchema,
  description: treeDescriptionSchema,
  visibility: visibilitySchema,
  publicTag: z.string().trim().max(40),
  allowSuggestions: z.boolean(),
  socialsEnabled: z.boolean(),
  photosEnabled: z.boolean(),
  hideLivingDetails: z.boolean(),
  visibleFields: z.array(personFieldSchema),
  theme: themeSchema,
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export const createPersonSchema = z.object({
  firstName: z.string().trim().min(1, "A first name is required.").max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  sex: z.enum(["male", "female", "other", "unknown"]).optional(),
});

export const createSuggestionSchema = z
  .object({
    type: suggestionTypeSchema,
    targetPersonId: z.string().uuid().nullable().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (value.type !== "new_person" && !value.targetPersonId) {
      context.addIssue({
        code: "custom",
        message: "Choose the person this suggestion is about.",
        path: ["targetPersonId"],
      });
    }
  });

export function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function resolvedPublicTag(visibility: z.infer<typeof visibilitySchema>, publicTag: string): string | null {
  const normalized = publicTag.trim() === "" ? null : normalizePublicTag(publicTag);
  if (visibility === "public") {
    if (!normalized || !isValidPublicTag(normalized)) {
      throw new Error("A public tree needs a tag of 3–40 letters, numbers, or hyphens.");
    }
    return normalized;
  }
  if (normalized && !isValidPublicTag(normalized)) {
    throw new Error("Tags use 3–40 letters, numbers, or hyphens.");
  }
  return normalized;
}

export function uniqueVisibleFields(fields: PersonField[]): PersonField[] {
  return [...new Set(fields)];
}

export function assertTheme(value: string): ThemeId {
  const parsed = themeSchema.safeParse(value);
  if (!parsed.success) throw new Error("Choose a theme from the list.");
  return parsed.data;
}
