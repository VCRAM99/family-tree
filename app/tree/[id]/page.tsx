import { Suspense } from "react";

import { TreeExperience } from "@/components/tree/tree-experience";
import type { PersonField } from "@/lib/domain";
import { PERSON_FIELDS } from "@/lib/domain";
import { parseCustomFieldDefs } from "@/lib/validation";
import { getTreeRole } from "@/lib/server/authz";
import { requireUser } from "@/lib/server/session";
import { getTreeGraph } from "@/lib/server/tree-graph";
import { readTree } from "@/lib/server/trees";
import { readViewerIdentity } from "@/lib/server/viewer-identity";
import { defaultPersonId } from "@/lib/family-graph";

export default async function TreePage({ params, searchParams }: PageProps<"/tree/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [tree, graph, identity, role] = await Promise.all([
    readTree(user.id, id),
    getTreeGraph(id, user.id),
    readViewerIdentity(user.id, id),
    getTreeRole(user.id, id),
  ]);
  const requested = typeof query.person === "string" ? query.person : null;
  const initialPersonId = defaultPersonId(graph, identity?.personId ?? null, requested);
  const visibleFields = tree.visibleFields.filter((field): field is PersonField => (PERSON_FIELDS as readonly string[]).includes(field));

  return (
    <Suspense>
      <TreeExperience
        id={tree.id}
        name={tree.name}
        photosEnabled={tree.photosEnabled}
        socialsEnabled={tree.socialsEnabled}
        customFieldDefs={parseCustomFieldDefs(tree.customFieldDefs)}
        canEdit={role === "owner" || role === "admin"}
        visibleFields={visibleFields}
        viewerPersonId={identity?.personId ?? null}
        initialPersonId={initialPersonId}
        graph={graph}
      />
    </Suspense>
  );
}
