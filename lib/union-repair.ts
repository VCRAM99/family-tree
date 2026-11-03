export type RepairLink = {
  id: string;
  treeId: string;
  parentId: string;
  childId: string;
  unionId: string | null;
};

export type RepairUnion = {
  id: string;
  treeId: string;
  personAId: string;
  personBId: string;
};

export type UnionRepairPlan = {
  create: { treeId: string; personAId: string; personBId: string; linkIds: string[] }[];
  backfill: { linkId: string; unionId: string }[];
};

/** Children with two parents and no union get one. A null union_id is filled when the parents share one union. */
export function planUnionRepair(links: RepairLink[], unions: RepairUnion[]): UnionRepairPlan {
  const unionsByPair = new Map<string, string[]>();
  for (const union of unions) {
    const key = pairKey(union.treeId, union.personAId, union.personBId);
    const list = unionsByPair.get(key) ?? [];
    list.push(union.id);
    unionsByPair.set(key, list);
  }

  const byChild = new Map<string, RepairLink[]>();
  for (const link of links) {
    const key = `${link.treeId}:${link.childId}`;
    const list = byChild.get(key) ?? [];
    list.push(link);
    byChild.set(key, list);
  }

  const create: UnionRepairPlan["create"] = [];
  const backfill: UnionRepairPlan["backfill"] = [];
  const children = [...byChild.keys()].sort((a, b) => a.localeCompare(b));
  for (const key of children) {
    const group = byChild.get(key) ?? [];
    if (group.length !== 2) continue;
    const [first, second] = [...group].sort((a, b) => a.parentId.localeCompare(b.parentId));
    if (!first || !second || first.treeId !== second.treeId) continue;
    const shared = unionsByPair.get(pairKey(first.treeId, first.parentId, second.parentId)) ?? [];
    if (shared.length === 0) {
      create.push({
        treeId: first.treeId,
        personAId: first.parentId,
        personBId: second.parentId,
        linkIds: [first.id, second.id].sort((a, b) => a.localeCompare(b)),
      });
      continue;
    }
    if (shared.length !== 1) continue;
    const unionId = shared[0];
    if (!unionId) continue;
    for (const link of [first, second]) {
      if (!link.unionId) backfill.push({ linkId: link.id, unionId });
    }
  }

  create.sort((a, b) => a.treeId.localeCompare(b.treeId) || a.personAId.localeCompare(b.personAId) || a.personBId.localeCompare(b.personBId));
  backfill.sort((a, b) => a.linkId.localeCompare(b.linkId));
  return { create, backfill };
}

function pairKey(treeId: string, left: string, right: string): string {
  const [a, b] = [left, right].sort((x, y) => x.localeCompare(y));
  return `${treeId}:${a}:${b}`;
}
