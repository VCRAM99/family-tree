export const THEME_IDS = [
  "system",
  "light",
  "dark",
  "papyrus",
  "dark-paper",
  "sepia-archive",
  "blueprint",
  "sage-botanical",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const PERSON_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "birth_surname",
  "sex",
  "birth_date",
  "death_date",
  "birth_place",
  "native_place",
  "current_location",
  "occupation",
  "bio",
  "phone_whatsapp",
  "email",
  "instagram",
  "facebook",
] as const;

export type PersonField = (typeof PERSON_FIELDS)[number];

/** The tree card always shows the name and years. Extra lines stay off until chosen. */
export const DEFAULT_VISIBLE_FIELDS: PersonField[] = [];

/** Fields that can add a line under the years on a tree card. At most two are shown. */
export const NODE_EXTRA_FIELDS = ["birth_place", "native_place", "current_location", "occupation"] as const satisfies readonly PersonField[];

export const MAX_NODE_EXTRA_LINES = 2;

export type CustomFieldType = "text" | "long_text" | "number" | "date" | "url" | "select";

export type CustomFieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
  /** Choices for a select field. */
  options?: string[];
};

export type CustomFieldValues = Record<string, string | number | null>;

export type SuggestionPayload = Record<string, unknown>;
