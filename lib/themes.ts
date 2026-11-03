import { PERSON_FIELDS, THEME_IDS, type PersonField, type ThemeId } from "@/lib/domain";

export { PERSON_FIELDS, THEME_IDS, type PersonField, type ThemeId };

export const THEME_LABELS: Record<ThemeId, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  papyrus: "Papyrus",
  "dark-paper": "Dark paper",
  "sepia-archive": "Sepia archive",
  blueprint: "Blueprint",
  "sage-botanical": "Sage botanical",
};

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

export const PERSON_FIELD_LABELS: Record<PersonField, string> = {
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  preferred_name: "Preferred name",
  birth_surname: "Birth surname",
  sex: "Sex",
  birth_date: "Birth date",
  death_date: "Death date",
  birth_place: "Birth place",
  native_place: "Native place",
  current_location: "Current location",
  occupation: "Occupation",
  bio: "Biography",
  phone_whatsapp: "Phone / WhatsApp",
  email: "Email",
  instagram: "Instagram",
  facebook: "Facebook",
};
