import type { CustomFieldDef, CustomFieldType } from "@/lib/domain";
import type { DatePrecision, Sex } from "@/lib/family-graph";
import { isRealIsoDate } from "@/lib/validation";

export const CSV_COLUMNS = [
  "ref",
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "birth_surname",
  "sex",
  "birth_date",
  "death_date",
  "is_deceased",
  "birth_place",
  "native_place",
  "current_location",
  "occupation",
  "bio",
  "father_ref",
  "mother_ref",
  "spouse_refs",
  "phone_whatsapp",
  "email",
  "instagram",
  "facebook",
] as const;

const STANDARD = new Set<string>(CSV_COLUMNS);

const INSTRUCTIONS =
  "ref is the id you use in this file. father_ref, mother_ref, and spouse_refs point at those ids. Dates are YYYY, YYYY-MM, or YYYY-MM-DD. Prefix c. for an approximate date. Separate several spouses with semicolons.";

export type CsvDate = { date: string | null; precision: DatePrecision | null };

export type CsvPerson = {
  ref: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  preferredName: string | null;
  birthSurname: string | null;
  sex: Sex;
  birthDate: string | null;
  birthDatePrecision: DatePrecision | null;
  deathDate: string | null;
  deathDatePrecision: DatePrecision | null;
  isDeceased: boolean;
  birthPlace: string | null;
  nativePlace: string | null;
  currentLocation: string | null;
  occupation: string | null;
  bio: string | null;
  phoneWhatsapp: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  customFields: Record<string, string | null>;
};

export type CsvError = { row: number; ref: string; message: string };

export type CsvPlan = {
  people: CsvPerson[];
  links: { parentRef: string; childRef: string }[];
  unions: { a: string; b: string }[];
  customFieldDefs: CustomFieldDef[];
  errors: CsvError[];
};

export function templateCsv(): string {
  const header = CSV_COLUMNS.join(",");
  const rows = [
    row({
      ref: "1",
      first_name: "Ada",
      last_name: "King",
      preferred_name: "Ada",
      sex: "female",
      birth_date: "1815-12-10",
      death_date: "1852-11-27",
      is_deceased: "true",
      birth_place: "London, England",
      native_place: "London",
      occupation: "Mathematician",
      bio: "Wrote notes on the analytical engine.",
      spouse_refs: "2",
      email: "ada@example.com",
    }),
    row({
      ref: "2",
      first_name: "William",
      last_name: "King",
      sex: "male",
      birth_date: "1805",
      is_deceased: "true",
      birth_place: "London",
      native_place: "London",
      occupation: "Earl",
      spouse_refs: "1",
    }),
    row({
      ref: "3",
      first_name: "Byron",
      last_name: "King",
      sex: "male",
      birth_date: "c. 1836-05",
      is_deceased: "false",
      birth_place: "London",
      father_ref: "2",
      mother_ref: "1",
    }),
  ];
  return `# ${INSTRUCTIONS}\n${header}\n${rows.join("\n")}\n`;
}

export function parseCsvDate(raw: string): CsvDate & { error?: string } {
  const value = raw.trim();
  if (!value) return { date: null, precision: null };
  const approx = /^c\.\s*/i.test(value);
  const body = value.replace(/^c\.\s*/i, "");
  if (/^\d{4}$/.test(body)) return { date: `${body}-01-01`, precision: approx ? "approx" : "year" };
  if (/^\d{4}-\d{2}$/.test(body)) {
    const iso = `${body}-01`;
    if (!isRealIsoDate(iso)) return { date: null, precision: null, error: `“${raw}” is not a real date.` };
    return { date: iso, precision: approx ? "approx" : "month" };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(body)) {
    if (!isRealIsoDate(body)) return { date: null, precision: null, error: `“${raw}” is not a real date.` };
    return { date: body, precision: approx ? "approx" : "exact" };
  }
  return { date: null, precision: null, error: `“${raw}” is not a date. Use YYYY, YYYY-MM, or YYYY-MM-DD.` };
}

export function formatCsvDate(date: string | null, precision: DatePrecision | null): string {
  if (!date || !precision) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return "";
  const prefix = precision === "approx" ? "c. " : "";
  if (precision === "year" || (precision === "approx" && month === "01" && day === "01")) return `${prefix}${year}`;
  if (precision === "month" || (precision === "approx" && day === "01")) return `${prefix}${year}-${month}`;
  return `${prefix}${year}-${month}-${day}`;
}

export function previewCsv(text: string): CsvPlan {
  const { comments, table } = splitTable(text);
  const errors: CsvError[] = [];
  if (table.length === 0) {
    return { people: [], links: [], unions: [], customFieldDefs: [], errors: [{ row: 0, ref: "", message: "The file has no header row." }] };
  }
  const header = table[0]?.map((cell) => cell.trim()) ?? [];
  const missing = CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    errors.push({ row: 1, ref: "", message: `Missing columns: ${missing.join(", ")}.` });
  }
  const customHeader = header.filter((column) => column && !STANDARD.has(column));
  const declared = customTypes(comments);
  const customFieldDefs: CustomFieldDef[] = customHeader.map((column) => {
    const key = fieldKey(column);
    const type = declared.get(key) ?? declared.get(column) ?? "text";
    return { key, label: column, type };
  });
  const index = new Map(header.map((column, position) => [column, position]));
  const people: CsvPerson[] = [];
  const refs = new Set<string>();
  const rawRows: { row: number; ref: string; father: string; mother: string; spouses: string[] }[] = [];

  table.slice(1).forEach((cells, offset) => {
    if (cells.every((cell) => cell.trim() === "")) return;
    const row = offset + 2;
    const cell = (name: string) => {
      const position = index.get(name);
      return position == null ? "" : (cells[position] ?? "").trim();
    };
    const ref = cell("ref");
    if (!ref) {
      errors.push({ row, ref: "", message: "Each person needs a ref." });
      return;
    }
    if (refs.has(ref)) errors.push({ row, ref, message: `Ref ${ref} is used more than once.` });
    refs.add(ref);
    const firstName = cell("first_name");
    if (!firstName) errors.push({ row, ref, message: "A first name is required." });
    const sex = parseSex(cell("sex"));
    if (!sex) errors.push({ row, ref, message: `Sex must be female, male, other, or unknown.` });
    const birth = parseCsvDate(cell("birth_date"));
    const death = parseCsvDate(cell("death_date"));
    if (birth.error) errors.push({ row, ref, message: birth.error });
    if (death.error) errors.push({ row, ref, message: death.error });
    if (birth.date && death.date && death.date < birth.date) {
      errors.push({ row, ref, message: "Death date can’t be earlier than the birth date." });
    }
    const deceasedFlag = parseBool(cell("is_deceased"));
    if (deceasedFlag == null) errors.push({ row, ref, message: "is_deceased must be true or false." });
    const customFields: Record<string, string | null> = {};
    for (const definition of customFieldDefs) {
      const position = index.get(definition.label);
      const value = position == null ? "" : (cells[position] ?? "").trim();
      customFields[definition.key] = value || null;
    }
    people.push({
      ref,
      firstName,
      middleName: empty(cell("middle_name")),
      lastName: empty(cell("last_name")),
      preferredName: empty(cell("preferred_name")),
      birthSurname: empty(cell("birth_surname")),
      sex: sex ?? "unknown",
      birthDate: birth.date,
      birthDatePrecision: birth.precision,
      deathDate: death.date,
      deathDatePrecision: death.precision,
      isDeceased: Boolean(death.date) || Boolean(deceasedFlag),
      birthPlace: empty(cell("birth_place")),
      nativePlace: empty(cell("native_place")),
      currentLocation: empty(cell("current_location")),
      occupation: empty(cell("occupation")),
      bio: empty(cell("bio")),
      phoneWhatsapp: empty(cell("phone_whatsapp")),
      email: empty(cell("email")),
      instagram: empty(cell("instagram")),
      facebook: empty(cell("facebook")),
      customFields,
    });
    rawRows.push({
      row,
      ref,
      father: cell("father_ref"),
      mother: cell("mother_ref"),
      spouses: cell("spouse_refs")
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  });

  const links: { parentRef: string; childRef: string }[] = [];
  const unionKeys = new Set<string>();
  const unions: { a: string; b: string }[] = [];
  function addUnion(left: string, right: string) {
    if (!left || !right || left === right) return;
    const [a, b] = left < right ? [left, right] : [right, left];
    const key = `${a}|${b}`;
    if (unionKeys.has(key)) return;
    unionKeys.add(key);
    unions.push({ a, b });
  }

  for (const item of rawRows) {
    for (const [role, parent] of [
      ["father_ref", item.father],
      ["mother_ref", item.mother],
    ] as const) {
      if (!parent) continue;
      if (!refs.has(parent)) errors.push({ row: item.row, ref: item.ref, message: `${role} ${parent} does not match a ref in this file.` });
      else links.push({ parentRef: parent, childRef: item.ref });
    }
    if (item.father && item.mother && refs.has(item.father) && refs.has(item.mother)) addUnion(item.father, item.mother);
    for (const spouse of item.spouses) {
      if (!refs.has(spouse)) errors.push({ row: item.row, ref: item.ref, message: `spouse_refs ${spouse} does not match a ref in this file.` });
      else addUnion(item.ref, spouse);
    }
  }

  const cycle = ancestryCycle(links);
  if (cycle) errors.push({ row: cycle.row, ref: cycle.ref, message: "That parent link would make an ancestry cycle." });

  return { people, links: cycle ? [] : links, unions: cycle ? [] : unions, customFieldDefs, errors };
}

export function exportCsv(
  people: CsvPerson[],
  links: { parentRef: string; childRef: string }[],
  unions: { a: string; b: string }[] = [],
  customFieldDefs: CustomFieldDef[] = [],
): string {
  const byChild = new Map<string, string[]>();
  for (const link of links) {
    const list = byChild.get(link.childRef) ?? [];
    list.push(link.parentRef);
    byChild.set(link.childRef, list);
  }
  const spouseOf = new Map<string, string[]>();
  for (const union of unions) {
    spouseOf.set(union.a, [...(spouseOf.get(union.a) ?? []), union.b]);
  }
  const header = [...CSV_COLUMNS, ...customFieldDefs.map((field) => field.label)];
  const lines = [`# ${INSTRUCTIONS}`];
  if (customFieldDefs.length > 0) {
    lines.push(`# custom ${customFieldDefs.map((field) => `${field.key}:${field.type}`).join(" ")}`);
  }
  lines.push(header.join(","));
  for (const person of people) {
    const parents = byChild.get(person.ref) ?? [];
    const record: Record<string, string> = {
      ref: person.ref,
      first_name: person.firstName,
      middle_name: person.middleName ?? "",
      last_name: person.lastName ?? "",
      preferred_name: person.preferredName ?? "",
      birth_surname: person.birthSurname ?? "",
      sex: person.sex,
      birth_date: formatCsvDate(person.birthDate, person.birthDatePrecision),
      death_date: formatCsvDate(person.deathDate, person.deathDatePrecision),
      is_deceased: person.isDeceased ? "true" : "false",
      birth_place: person.birthPlace ?? "",
      native_place: person.nativePlace ?? "",
      current_location: person.currentLocation ?? "",
      occupation: person.occupation ?? "",
      bio: person.bio ?? "",
      father_ref: parents[0] ?? "",
      mother_ref: parents[1] ?? "",
      spouse_refs: (spouseOf.get(person.ref) ?? []).join(";"),
      phone_whatsapp: person.phoneWhatsapp ?? "",
      email: person.email ?? "",
      instagram: person.instagram ?? "",
      facebook: person.facebook ?? "",
    };
    for (const field of customFieldDefs) record[field.label] = person.customFields[field.key] ?? "";
    lines.push(header.map((column) => csvCell(record[column] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Stable comparison key for a parsed plan, ignoring ref labels. */
export function planSignature(plan: CsvPlan): string {
  const names = new Map(plan.people.map((person) => [person.ref, person.firstName]));
  const people = plan.people
    .map((person) =>
      [
        person.firstName,
        person.lastName ?? "",
        person.sex,
        formatCsvDate(person.birthDate, person.birthDatePrecision),
        formatCsvDate(person.deathDate, person.deathDatePrecision),
        person.birthPlace ?? "",
        person.nativePlace ?? "",
        person.isDeceased ? "1" : "0",
      ].join("|"),
    )
    .sort();
  const links = plan.links
    .map((link) => `${names.get(link.parentRef)}>${names.get(link.childRef)}`)
    .sort();
  const unions = plan.unions
    .map((union) => [names.get(union.a), names.get(union.b)].sort().join("+"))
    .sort();
  return JSON.stringify({ people, links, unions });
}

function ancestryCycle(links: { parentRef: string; childRef: string }[]): { row: number; ref: string } | null {
  const parents = new Map<string, string[]>();
  for (const link of links) {
    const list = parents.get(link.childRef) ?? [];
    list.push(link.parentRef);
    parents.set(link.childRef, list);
  }
  const state = new Map<string, "visiting" | "done">();
  function visit(ref: string): boolean {
    const mark = state.get(ref);
    if (mark === "visiting") return true;
    if (mark === "done") return false;
    state.set(ref, "visiting");
    for (const parent of parents.get(ref) ?? []) {
      if (visit(parent)) return true;
    }
    state.set(ref, "done");
    return false;
  }
  for (const ref of parents.keys()) {
    if (visit(ref)) return { row: 0, ref };
  }
  return null;
}

function customTypes(comments: string[]): Map<string, CustomFieldType> {
  const types = new Map<string, CustomFieldType>();
  for (const comment of comments) {
    const match = /^custom\s+(.+)$/.exec(comment.trim());
    if (!match?.[1]) continue;
    for (const part of match[1].split(/\s+/)) {
      const [key, type] = part.split(":");
      if (!key || !type) continue;
      if (type === "text" || type === "date" || type === "location" || type === "select" || type === "long_text" || type === "number" || type === "url") {
        types.set(key, type);
      }
    }
  }
  return types;
}

function fieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const key = /^[a-z]/.test(slug) ? slug : `field_${slug || "extra"}`;
  return key.slice(0, 40);
}

function parseSex(value: string): Sex | null {
  if (!value) return "unknown";
  if (value === "female" || value === "male" || value === "other" || value === "unknown") return value;
  return null;
}

function parseBool(value: string): boolean | null {
  if (!value || value === "false" || value === "no" || value === "0") return false;
  if (value === "true" || value === "yes" || value === "1") return true;
  return null;
}

function empty(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function splitTable(text: string): { comments: string[]; table: string[][] } {
  const comments: string[] = [];
  const lines: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of text.replace(/^\uFEFF/, "")) {
    if (char === '"') {
      current += char;
      quoted = !quoted;
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r") continue;
      lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);
  const table: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      comments.push(trimmed.slice(1).trim());
      continue;
    }
    table.push(parseCsvLine(line));
  }
  return { comments, table };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char ?? "";
  }
  cells.push(current);
  return cells;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function row(values: Partial<Record<(typeof CSV_COLUMNS)[number], string>>): string {
  return CSV_COLUMNS.map((column) => csvCell(values[column] ?? "")).join(",");
}
