import { z } from "zod";

import { PERSON_FIELDS, THEME_IDS, type CustomFieldDef, type CustomFieldValues, type PersonField, type ThemeId } from "@/lib/domain";
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

export const customFieldTypeSchema = z.enum(["text", "long_text", "number", "date", "url", "select"]);

export const customFieldDefSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a short field key."),
    label: z.string().trim().min(1, "Name the custom field.").max(60),
    type: customFieldTypeSchema,
    options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "select" && (!value.options || value.options.length === 0)) {
      context.addIssue({ code: "custom", message: "Add at least one choice.", path: ["options"] });
    }
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
  customFieldDefs: z.array(customFieldDefSchema).max(40),
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

const phonePattern = /^\+?[0-9][0-9\s().-]{5,18}[0-9]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const handlePattern = /^@?[A-Za-z0-9._]{1,50}$/;

export function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isRealIsoDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function personDateError(input: {
  birthDate: string | null;
  birthDatePrecision: string | null;
  deathDate: string | null;
  deathDatePrecision: string | null;
}): string | null {
  if ((input.birthDate == null) !== (input.birthDatePrecision == null)) return "Birth date needs both a date and a precision.";
  if ((input.deathDate == null) !== (input.deathDatePrecision == null)) return "Death date needs both a date and a precision.";
  if (input.birthDate && !isRealIsoDate(input.birthDate)) return "Enter a real birth date.";
  if (input.deathDate && !isRealIsoDate(input.deathDate)) return "Enter a real death date.";
  if (input.birthDate && input.deathDate && input.deathDate < input.birthDate) {
    return "Death date can’t be earlier than the birth date.";
  }
  return null;
}

export function contactError(input: {
  phoneWhatsapp: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
}): string | null {
  if (input.phoneWhatsapp && !phonePattern.test(input.phoneWhatsapp)) return "Enter a phone number with digits, spaces, or +.";
  if (input.email && !emailPattern.test(input.email)) return "Enter a valid email address.";
  if (input.instagram && !handlePattern.test(input.instagram) && !isHttpUrl(input.instagram)) return "Enter an Instagram handle or link.";
  if (input.facebook && !handlePattern.test(input.facebook) && !isHttpUrl(input.facebook)) return "Enter a Facebook handle or link.";
  return null;
}

export function customFieldsError(defs: CustomFieldDef[], values: CustomFieldValues): string | null {
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === "") continue;
    const definition = defs.find((field) => field.key === key);
    if (!definition) continue;
    if (definition.type === "date" && (typeof value !== "string" || !isRealIsoDate(value))) return `Enter a real date for ${definition.label}.`;
    if (definition.type === "url" && (typeof value !== "string" || !isHttpUrl(value))) return `Enter a valid link for ${definition.label}.`;
    if (definition.type === "number" && typeof value === "string" && !/^-?\d+(\.\d+)?$/.test(value)) {
      return `Enter a number for ${definition.label}.`;
    }
    if (definition.type === "select") {
      const options = definition.options ?? [];
      if (typeof value !== "string" || !options.includes(value)) return `Choose a value for ${definition.label}.`;
    }
    if ((definition.type === "text" || definition.type === "long_text") && typeof value === "string") {
      const max = definition.type === "long_text" ? 8000 : 500;
      if (value.length > max) return `Keep ${definition.label} shorter.`;
    }
  }
  return null;
}

export function unionDateError(startDate: string | null, endDate: string | null): string | null {
  if (startDate && !isRealIsoDate(startDate)) return "Enter a real start date.";
  if (endDate && !isRealIsoDate(endDate)) return "Enter a real end date.";
  if (startDate && endDate && endDate < startDate) return "The end date can’t be earlier than the start.";
  return null;
}

export function parseCustomFieldDefs(value: unknown): CustomFieldDef[] {
  const parsed = z.array(customFieldDefSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function assertTheme(value: string): ThemeId {
  const parsed = themeSchema.safeParse(value);
  if (!parsed.success) throw new Error("Choose a theme from the list.");
  return parsed.data;
}
