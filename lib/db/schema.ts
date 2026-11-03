import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { DEFAULT_VISIBLE_FIELDS, type CustomFieldDef, type CustomFieldValues, type PersonField, type SuggestionPayload } from "@/lib/domain";

export type { CustomFieldDef, CustomFieldValues, PersonField, SuggestionPayload, ThemeId } from "@/lib/domain";

export {
  account,
  accountRelations,
  rateLimit,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth-schema";

/**
 * Photos are stored as WebP bytes. The driver hands back either a Node Buffer
 * or a PGlite Uint8Array; both are normalized to Uint8Array.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer | Uint8Array | string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof value === "string") {
      if (value.startsWith("\\x")) return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
      return Uint8Array.from(Buffer.from(value, "base64"));
    }
    return new Uint8Array(value);
  },
});

export const treeVisibilityEnum = pgEnum("tree_visibility", ["private", "unlisted", "public"]);
export const treeAdminRoleEnum = pgEnum("tree_admin_role", ["owner", "admin"]);
export const treeAdminStatusEnum = pgEnum("tree_admin_status", ["pending", "accepted"]);
export const personSexEnum = pgEnum("person_sex", ["male", "female", "other", "unknown"]);
export const datePrecisionEnum = pgEnum("date_precision", ["exact", "month", "year", "approx"]);
export const parentLinkKindEnum = pgEnum("parent_link_kind", ["biological", "adoptive", "step", "foster"]);
export const unionStatusEnum = pgEnum("union_status", ["married", "divorced", "widowed", "partner"]);
export const suggestionTypeEnum = pgEnum("suggestion_type", ["new_person", "contact_update", "correction"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "approved", "rejected"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const defaultVisibleFields = sql.raw(
  DEFAULT_VISIBLE_FIELDS.length > 0
    ? `ARRAY[${DEFAULT_VISIBLE_FIELDS.map((field) => `'${field}'`).join(",")}]::text[]`
    : `'{}'::text[]`,
);

export const trees = pgTable(
  "trees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    visibility: treeVisibilityEnum("visibility").notNull().default("private"),
    shareCode: char("share_code", { length: 8 }).notNull().unique(),
    publicTag: text("public_tag"),
    allowSuggestions: boolean("allow_suggestions").notNull().default(false),
    socialsEnabled: boolean("socials_enabled").notNull().default(false),
    photosEnabled: boolean("photos_enabled").notNull().default(false),
    hideLivingDetails: boolean("hide_living_details").notNull().default(true),
    notifySuggestions: boolean("notify_suggestions").notNull().default(true),
    visibleFields: text("visible_fields").array().$type<PersonField[]>().notNull().default(defaultVisibleFields),
    theme: text("theme").notNull().default("system"),
    customFieldDefs: jsonb("custom_field_defs").$type<CustomFieldDef[]>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("trees_owner_id_idx").on(table.ownerId),
    uniqueIndex("trees_public_tag_lower_uidx").on(sql`lower(${table.publicTag})`),
    check(
      "trees_share_code_alphabet",
      sql`${table.shareCode} ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'`,
    ),
    check(
      "trees_public_tag_required_when_public",
      sql`${table.visibility} <> 'public' OR ${table.publicTag} IS NOT NULL`,
    ),
    check(
      "trees_public_tag_format",
      sql`${table.publicTag} IS NULL OR ${table.publicTag} ~ '^[a-z0-9-]{3,40}$'`,
    ),
    check(
      "trees_theme_known",
      sql`${table.theme} in ('system', 'light', 'dark', 'papyrus', 'dark-paper', 'sepia-archive', 'blueprint', 'sage-botanical')`,
    ),
  ],
);

export const treeAdmins = pgTable(
  "tree_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    role: treeAdminRoleEnum("role").notNull(),
    status: treeAdminStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (table) => [
    index("tree_admins_tree_id_idx").on(table.treeId),
    index("tree_admins_user_id_idx").on(table.userId),
    unique("tree_admins_tree_user_uidx").on(table.treeId, table.userId),
    uniqueIndex("tree_admins_tree_email_uidx").on(table.treeId, sql`lower(${table.invitedEmail})`),
  ],
);

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name"),
    preferredName: text("preferred_name"),
    birthSurname: text("birth_surname"),
    sex: personSexEnum("sex").notNull().default("unknown"),
    birthDate: date("birth_date"),
    birthDatePrecision: datePrecisionEnum("birth_date_precision"),
    deathDate: date("death_date"),
    deathDatePrecision: datePrecisionEnum("death_date_precision"),
    isDeceased: boolean("is_deceased").notNull().default(false),
    birthPlace: text("birth_place"),
    nativePlace: text("native_place"),
    currentLocation: text("current_location"),
    occupation: text("occupation"),
    bio: text("bio"),
    hasPhoto: boolean("has_photo").notNull().default(false),
    phoneWhatsapp: text("phone_whatsapp"),
    email: text("email"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    isPlaceholder: boolean("is_placeholder").notNull().default(false),
    customFields: jsonb("custom_fields").$type<CustomFieldValues>().notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("persons_id_tree_uidx").on(table.id, table.treeId),
    index("persons_tree_id_idx").on(table.treeId),
    check(
      "persons_birth_precision_pair",
      sql`(${table.birthDate} is null and ${table.birthDatePrecision} is null) or (${table.birthDate} is not null and ${table.birthDatePrecision} is not null)`,
    ),
    check(
      "persons_death_precision_pair",
      sql`(${table.deathDate} is null and ${table.deathDatePrecision} is null) or (${table.deathDate} is not null and ${table.deathDatePrecision} is not null)`,
    ),
  ],
);

export const personPhotos = pgTable(
  "person_photos",
  {
    personId: uuid("person_id")
      .primaryKey()
      .references(() => persons.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("person_photos_mime_webp", sql`${table.mime} = 'image/webp'`),
    check("person_photos_max_bytes", sql`${table.sizeBytes} <= 524288 and ${table.sizeBytes} >= 0`),
  ],
);

export const unions = pgTable(
  "unions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personAId: uuid("person_a_id").notNull(),
    personBId: uuid("person_b_id").notNull(),
    status: unionStatusEnum("status").notNull().default("married"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("unions_tree_id_idx").on(table.treeId),
    index("unions_person_a_id_idx").on(table.personAId),
    index("unions_person_b_id_idx").on(table.personBId),
    unique("unions_id_tree_uidx").on(table.id, table.treeId),
    check("unions_distinct_people", sql`${table.personAId} <> ${table.personBId}`),
    foreignKey({
      columns: [table.personAId, table.treeId],
      foreignColumns: [persons.id, persons.treeId],
      name: "unions_person_a_same_tree_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.personBId, table.treeId],
      foreignColumns: [persons.id, persons.treeId],
      name: "unions_person_b_same_tree_fk",
    }).onDelete("cascade"),
  ],
);

export const parentLinks = pgTable(
  "parent_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").notNull(),
    childId: uuid("child_id").notNull(),
    kind: parentLinkKindEnum("kind").notNull().default("biological"),
    unionId: uuid("union_id").references(() => unions.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("parent_links_parent_child_uidx").on(table.parentId, table.childId),
    index("parent_links_tree_id_idx").on(table.treeId),
    index("parent_links_parent_id_idx").on(table.parentId),
    index("parent_links_child_id_idx").on(table.childId),
    check("parent_links_not_self", sql`${table.parentId} <> ${table.childId}`),
    foreignKey({
      columns: [table.parentId, table.treeId],
      foreignColumns: [persons.id, persons.treeId],
      name: "parent_links_parent_same_tree_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.childId, table.treeId],
      foreignColumns: [persons.id, persons.treeId],
      name: "parent_links_child_same_tree_fk",
    }).onDelete("cascade"),
  ],
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    type: suggestionTypeEnum("type").notNull(),
    targetPersonId: uuid("target_person_id"),
    payload: jsonb("payload").$type<SuggestionPayload>().notNull().default(sql`'{}'::jsonb`),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("suggestions_tree_id_idx").on(table.treeId),
    index("suggestions_target_person_id_idx").on(table.targetPersonId),
    foreignKey({
      columns: [table.targetPersonId, table.treeId],
      foreignColumns: [persons.id, persons.treeId],
      name: "suggestions_target_same_tree_fk",
    }).onDelete("cascade"),
  ],
);

export const lookupBuckets = pgTable("lookup_buckets", {
  id: text("id").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const viewerIdentities = pgTable(
  "viewer_identities",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.treeId] }),
    index("viewer_identities_tree_id_idx").on(table.treeId),
    foreignKey({
      columns: [table.personId, table.treeId],
      foreignColumns: [persons.id, persons.treeId],
      name: "viewer_identities_person_same_tree_fk",
    }).onDelete("cascade"),
  ],
);
