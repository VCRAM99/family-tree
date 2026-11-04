import type { parentLinks, persons, unions } from "@/lib/db/schema";
import type { GraphParentLink, GraphPerson, GraphUnion } from "@/lib/family-graph";

type PersonRow = Pick<
  typeof persons.$inferSelect,
  | "id"
  | "treeId"
  | "firstName"
  | "middleName"
  | "lastName"
  | "preferredName"
  | "birthSurname"
  | "sex"
  | "birthDate"
  | "birthDatePrecision"
  | "deathDate"
  | "deathDatePrecision"
  | "isDeceased"
  | "birthPlace"
  | "nativePlace"
  | "currentLocation"
  | "occupation"
  | "bio"
  | "hasPhoto"
  | "phoneWhatsapp"
  | "email"
  | "instagram"
  | "facebook"
  | "customFields"
  | "isPlaceholder"
>;
type LinkRow = typeof parentLinks.$inferSelect;
type UnionRow = typeof unions.$inferSelect;

export function toGraphPerson(row: PersonRow): GraphPerson {
  return {
    id: row.id,
    treeId: row.treeId,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    preferredName: row.preferredName,
    birthSurname: row.birthSurname,
    sex: row.sex,
    birthDate: row.birthDate,
    birthDatePrecision: row.birthDatePrecision,
    deathDate: row.deathDate,
    deathDatePrecision: row.deathDatePrecision,
    isDeceased: row.isDeceased,
    birthPlace: row.birthPlace,
    nativePlace: row.nativePlace,
    currentLocation: row.currentLocation,
    occupation: row.occupation,
    bio: row.bio,
    hasPhoto: row.hasPhoto,
    phoneWhatsapp: row.phoneWhatsapp,
    email: row.email,
    instagram: row.instagram,
    facebook: row.facebook,
    customFields: row.customFields ?? {},
    isPlaceholder: row.isPlaceholder,
  };
}

export function toGraphLink(row: LinkRow): GraphParentLink {
  return {
    id: row.id,
    parentId: row.parentId,
    childId: row.childId,
    kind: row.kind,
    unionId: row.unionId,
  };
}

export function toGraphUnion(row: UnionRow): GraphUnion {
  return {
    id: row.id,
    personAId: row.personAId,
    personBId: row.personBId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    sortOrder: row.sortOrder,
  };
}
