import type { ParentKind, UnionStatus } from "@/lib/family-graph";
import type { LinkInput, NewPersonInput, PersonPatch, RelationInput } from "@/lib/person-edits";
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
} from "@/lib/server/person-writes";
import { getCurrentUser } from "@/lib/server/session";
import { clearViewerIdentity, setViewerIdentity } from "@/lib/server/viewer-identity";

type WriteBody = {
  op?: string;
  personId?: string;
  patch?: PersonPatch;
  input?: NewPersonInput | LinkInput | { type: "parent"; linkId: string } | { type: "union"; unionId: string };
  relation?: RelationInput;
  linkId?: string;
  kind?: ParentKind;
  unionId?: string;
  unionPatch?: { status?: UnionStatus; startDate?: string | null; endDate?: string | null };
  unionIds?: string[];
};

export async function POST(request: Request, context: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });

  let body: WriteBody;
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return Response.json({ error: "Could not read that change." }, { status: 400 });
  }

  try {
    switch (body.op) {
      case "updatePerson": {
        const person = await updatePerson(user.id, treeId, body.personId ?? "", body.patch ?? {});
        return Response.json({ person });
      }
      case "createPerson": {
        const result = await createPersonWithRelation(user.id, treeId, body.input as NewPersonInput, body.relation as RelationInput);
        return Response.json(result);
      }
      case "link": {
        const result = await linkPeople(user.id, treeId, body.input as LinkInput);
        return Response.json(result);
      }
      case "updateParentLink": {
        const link = await updateParentLink(user.id, treeId, body.linkId ?? "", body.kind ?? "biological");
        return Response.json({ link });
      }
      case "updateUnion": {
        const union = await updateUnion(user.id, treeId, body.unionId ?? "", body.unionPatch ?? {});
        return Response.json({ union });
      }
      case "reorderUnions": {
        const unions = await reorderUnions(user.id, treeId, body.personId ?? "", body.unionIds ?? []);
        return Response.json({ unions });
      }
      case "unlink": {
        await unlinkRelationship(
          user.id,
          treeId,
          body.input as { type: "parent"; linkId: string } | { type: "union"; unionId: string },
        );
        return Response.json({});
      }
      case "deletePerson": {
        const result = await deletePerson(user.id, treeId, body.personId ?? "");
        return Response.json(result);
      }
      case "setViewer": {
        if (body.personId) await setViewerIdentity(user.id, treeId, body.personId);
        else await clearViewerIdentity(user.id, treeId);
        return Response.json({});
      }
      default:
        return Response.json({ error: "Unknown change." }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: actionError(error) });
  }
}
