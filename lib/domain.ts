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

/** Names and life dates are visible by default. Contact fields stay off until chosen. */
export const DEFAULT_VISIBLE_FIELDS: PersonField[] = [
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "sex",
  "birth_date",
  "death_date",
  "birth_place",
  "native_place",
  "occupation",
  "bio",
];

export type CustomFieldType = "text" | "long_text" | "number" | "date" | "url";

export type CustomFieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
};

export type CustomFieldValues = Record<string, string | number | null>;

export type SuggestionPayload = Record<string, unknown>;
