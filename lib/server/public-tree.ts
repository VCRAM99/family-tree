import "server-only";

import type { CustomFieldDef, ThemeId } from "@/lib/domain";

/**
 * Sanitized reads for the public and unlisted viewers.
 * Prompt 4 fills these in. The shapes are stable so the viewer can land without a schema change.
 */
export type PublicTreeSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: "unlisted" | "public";
  publicTag: string | null;
  allowSuggestions: boolean;
  socialsEnabled: boolean;
  photosEnabled: boolean;
  hideLivingDetails: boolean;
  visibleFields: string[];
  theme: ThemeId;
  customFieldDefs: CustomFieldDef[];
};

export type PublicPerson = {
  id: string;
  displayName: string;
  fields: Record<string, string | null>;
};

export async function getPublicTreeByShareCode(code: string): Promise<PublicTreeSummary | null> {
  // TODO(prompt-4): resolve an unlisted or public tree by share code and return a sanitized summary.
  void code;
  throw new Error("Not implemented: public tree lookup by share code is prompt 4.");
}

export async function getPublicTreeByTag(tag: string): Promise<PublicTreeSummary | null> {
  // TODO(prompt-4): resolve a public tree by its public tag.
  void tag;
  throw new Error("Not implemented: public tree lookup by tag is prompt 4.");
}

export async function listPublicPersons(treeId: string): Promise<PublicPerson[]> {
  // TODO(prompt-4): apply visible_fields, hide_living_details, socials_enabled, and photos_enabled.
  void treeId;
  throw new Error("Not implemented: sanitized public persons are prompt 4.");
}
