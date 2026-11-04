"use server";

import type { ParentKind, UnionStatus } from "@/lib/family-graph";
import { actionError } from "@/lib/server/errors";
import {
  createPersonWithRelation,
  deletePerson,
  linkPeople,
  reorderUnions,
  unlinkRelationship,
  updateParentLink,
  updatePerson,
  updateUnion,
  type LinkInput,
  type NewPersonInput,
  type PersonPatch,
  type RelationInput,
} from "@/lib/server/person-writes";
import { requireUser } from "@/lib/server/session";
import { readTree } from "@/lib/server/trees";
import { clearViewerIdentity, setViewerIdentity } from "@/lib/server/viewer-identity";

export async function updatePersonAction(treeId: string, personId: string, patch: PersonPatch) {
  const user = await requireUser();
  try {
    const person = await updatePerson(user.id, treeId, personId, patch);
    return { person };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function createPersonAction(treeId: string, input: NewPersonInput, relation: RelationInput) {
  const user = await requireUser();
  try {
    const result = await createPersonWithRelation(user.id, treeId, input, relation);
    return result;
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function linkPeopleAction(treeId: string, input: LinkInput) {
  const user = await requireUser();
  try {
    const result = await linkPeople(user.id, treeId, input);
    return result;
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateParentLinkAction(treeId: string, linkId: string, kind: ParentKind) {
  const user = await requireUser();
  try {
    const link = await updateParentLink(user.id, treeId, linkId, kind);
    return { link };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateUnionAction(
  treeId: string,
  unionId: string,
  patch: { status?: UnionStatus; startDate?: string | null; endDate?: string | null },
) {
  const user = await requireUser();
  try {
    const union = await updateUnion(user.id, treeId, unionId, patch);
    return { union };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function reorderUnionsAction(treeId: string, personId: string, unionIds: string[]) {
  const user = await requireUser();
  try {
    const saved = await reorderUnions(user.id, treeId, personId, unionIds);
    return { unions: saved };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function unlinkAction(treeId: string, input: { type: "parent"; linkId: string } | { type: "union"; unionId: string }) {
  const user = await requireUser();
  try {
    await unlinkRelationship(user.id, treeId, input);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function deletePersonAction(treeId: string, personId: string) {
  const user = await requireUser();
  try {
    const result = await deletePerson(user.id, treeId, personId);
    return result;
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function readTreeAction(treeId: string): Promise<{ name: string } | { error: string }> {
  const user = await requireUser();
  try {
    const tree = await readTree(user.id, treeId);
    return { name: tree.name };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function setViewerAction(treeId: string, personId: string | null) {
  const user = await requireUser();
  try {
    if (personId) await setViewerIdentity(user.id, treeId, personId);
    else await clearViewerIdentity(user.id, treeId);
    return {};
  } catch (error) {
    return { error: actionError(error) };
  }
}
