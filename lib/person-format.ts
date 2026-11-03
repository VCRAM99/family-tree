import type { DatePrecision, GraphPerson } from "@/lib/family-graph";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Year line on a tree card: "1968", "1968 – 2020", or "c. 1920". */
export function cardYearLabel(
  person: Pick<GraphPerson, "birthDate" | "birthDatePrecision" | "deathDate" | "deathDatePrecision" | "isDeceased">,
): string | null {
  const birth = yearToken(person.birthDate, person.birthDatePrecision);
  const death = yearToken(person.deathDate, person.deathDatePrecision);
  if (birth && death) return `${birth} – ${death}`;
  if (birth && person.isDeceased) return `${birth} –`;
  if (birth) return birth;
  if (death) return death;
  return null;
}

function yearToken(iso: string | null, precision: DatePrecision | null): string | null {
  if (!iso) return null;
  const year = iso.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  if (precision === "approx") return `c. ${year}`;
  return year;
}

export function formatLifeDate(iso: string | null, precision: DatePrecision | null): string | null {
  if (!iso || !precision) return null;
  const parts = parseIso(iso);
  if (!parts) return null;
  const month = MONTHS[parts.m - 1] ?? "";
  if (precision === "approx") return `c. ${parts.y}`;
  if (precision === "year") return String(parts.y);
  if (precision === "month") return `${month} ${parts.y}`;
  return `${parts.d} ${month} ${parts.y}`;
}

export function ageLabel(person: Pick<GraphPerson, "birthDate" | "birthDatePrecision" | "deathDate" | "deathDatePrecision" | "isDeceased">, today = new Date()): string | null {
  if (!person.birthDate || !person.birthDatePrecision) return null;
  const birth = parseIso(person.birthDate);
  if (!birth) return null;
  const deceased = person.isDeceased || Boolean(person.deathDate);
  const end = deceased && person.deathDate ? parseIso(person.deathDate) : localParts(today);
  if (!end) return null;
  const years = yearsBetween(birth, end, deceased && person.deathDatePrecision ? person.deathDatePrecision : person.birthDatePrecision);
  if (deceased && person.deathDate) return `aged ${years}`;
  if (deceased) return null;
  return `Age ${years}`;
}

export function whatsAppHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `https://wa.me/${digits}`;
}

export function instagramHref(value: string | null): string | null {
  return socialHref(value, "https://instagram.com/");
}

export function facebookHref(value: string | null): string | null {
  return socialHref(value, "https://facebook.com/");
}

function socialHref(value: string | null, base: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "").replace(/^\/+/, "");
  if (!handle) return null;
  return `${base}${handle}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function localParts(date: Date): { y: number; m: number; d: number } {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function yearsBetween(
  birth: { y: number; m: number; d: number },
  end: { y: number; m: number; d: number },
  precision: DatePrecision,
): number {
  let years = end.y - birth.y;
  if (precision === "year" || precision === "approx") return Math.max(0, years);
  if (precision === "month") {
    if (end.m < birth.m) years -= 1;
    return Math.max(0, years);
  }
  if (end.m < birth.m || (end.m === birth.m && end.d < birth.d)) years -= 1;
  return Math.max(0, years);
}
