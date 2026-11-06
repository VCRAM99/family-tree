import { childrenGrouped, createGraphIndex, effectiveUnionId, orderingYear, spouses, type GraphIndex, type GraphPerson, type ParentKind, type TreeGraph } from "@/lib/family-graph";

import { assignGenerations } from "./generations";
import { JUNCTION_SIZE, PERSON_HEIGHT, PERSON_WIDTH, type LayoutEdge } from "./types";

export function junctionId(unionId: string): string {
  return `union:${unionId}`;
}

export function soloJunctionId(parentId: string): string {
  return `solo:${parentId}`;
}

export function isJunctionId(id: string): boolean {
  return id.startsWith("union:") || id.startsWith("solo:");
}

type ElkChild = {
  id: string;
  width: number;
  height: number;
  layoutOptions: Record<string, string>;
  modelIndex: number;
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
};

export type ElkInput = {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkChild[];
  edges: ElkEdge[];
};

/**
 * People keep their generation partition (even layers). Each union is a junction on the
 * layer between the younger parent and the children, so a long uncle–niece edge stays
 * long and children center under that union.
 */
export function buildElkGraph(graph: TreeGraph, generations = assignGenerations(graph)): { elk: ElkInput; edges: LayoutEdge[] } {
  const index = createGraphIndex(graph);
  const layerPeople = orderGenerations(index, generations);

  const children: ElkChild[] = [];
  const elkEdges: ElkEdge[] = [];
  const edges: LayoutEdge[] = [];
  const placed = new Set<string>();
  let modelIndex = 0;

  function addNode(id: string, partition: number, width: number, height: number) {
    if (placed.has(id)) return;
    placed.add(id);
    const index = modelIndex;
    modelIndex += 1;
    children.push({
      id,
      width,
      height,
      modelIndex: index,
      layoutOptions: { "elk.partitioning.partition": String(partition) },
    });
  }

  const generationsSorted = [...layerPeople.keys()].sort((a, b) => a - b);
  for (const generation of generationsSorted) {
    for (const id of layerPeople.get(generation) ?? []) addNode(id, generation * 2, PERSON_WIDTH, PERSON_HEIGHT);
  }

  const unions = [...graph.unions].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  for (const union of unions) {
    const left = generations.get(union.personAId);
    const right = generations.get(union.personBId);
    if (left === undefined || right === undefined) continue;
    const partition = Math.max(left, right) * 2 + 1;
    addNode(junctionId(union.id), partition, JUNCTION_SIZE, JUNCTION_SIZE);
    elkEdges.push({ id: `e-${union.id}-a`, sources: [union.personAId], targets: [junctionId(union.id)] });
    elkEdges.push({ id: `e-${union.id}-b`, sources: [union.personBId], targets: [junctionId(union.id)] });
    edges.push({
      id: `spouse-${union.id}`,
      source: union.personAId,
      target: union.personBId,
      kind: "spouse",
      unionStatus: union.status,
    });
  }

  const soloParents = new Set<string>();
  for (const link of graph.parentLinks) {
    const unionKey = effectiveUnionId(index, link);
    if (unionKey && graph.unions.some((union) => union.id === unionKey)) {
      const source = junctionId(unionKey);
      const edgeId = `child-${unionKey}-${link.childId}`;
      if (!elkEdges.some((edge) => edge.id === `layout-${edgeId}`)) {
        elkEdges.push({ id: `layout-${edgeId}`, sources: [source], targets: [link.childId] });
        edges.push({ id: edgeId, source, target: link.childId, kind: "child" });
      }
      edges.push({
        id: `parent-${link.id}`,
        source: link.parentId,
        target: source,
        kind: "parent",
        parentKind: link.kind,
        tooltip: link.kind === "biological" ? undefined : parentTooltip(link.kind),
      });
      continue;
    }
    soloParents.add(link.parentId);
  }

  for (const parentId of [...soloParents].sort((a, b) => a.localeCompare(b))) {
    const generation = generations.get(parentId);
    if (generation === undefined) continue;
    const id = soloJunctionId(parentId);
    addNode(id, generation * 2 + 1, JUNCTION_SIZE, JUNCTION_SIZE);
    elkEdges.push({ id: `e-solo-${parentId}`, sources: [parentId], targets: [id] });
    const childIds = new Set((index.childrenOf.get(parentId) ?? []).filter((link) => !effectiveUnionId(index, link)).map((link) => link.childId));
    for (const childId of [...childIds].sort((a, b) => a.localeCompare(b))) {
      elkEdges.push({ id: `layout-solo-${parentId}-${childId}`, sources: [id], targets: [childId] });
      edges.push({ id: `child-solo-${parentId}-${childId}`, source: id, target: childId, kind: "child" });
    }
    for (const link of index.childrenOf.get(parentId) ?? []) {
      if (effectiveUnionId(index, link)) continue;
      edges.push({
        id: `parent-${link.id}`,
        source: parentId,
        target: id,
        kind: "parent",
        parentKind: link.kind,
        tooltip: link.kind === "biological" ? undefined : parentTooltip(link.kind),
      });
    }
  }

  children.sort(
    (a, b) =>
      Number(a.layoutOptions["elk.partitioning.partition"]) - Number(b.layoutOptions["elk.partitioning.partition"]) ||
      a.modelIndex - b.modelIndex,
  );

  return {
    elk: {
      id: "tree",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.partitioning.activate": "true",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.crossingMinimization.strategy": graph.persons.length > 500 ? "INTERACTIVE" : "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.nodePlacement.strategy": graph.persons.length > 500 ? "SIMPLE" : "NETWORK_SIMPLEX",
        "elk.layered.thoroughness": graph.persons.length > 500 ? "1" : "4",
        "elk.layered.cycleBreaking.strategy": "GREEDY",
        "elk.spacing.nodeNode": "48",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
        "elk.spacing.edgeNode": "24",
        "elk.separateConnectedComponents": "false",
        "elk.padding": "[top=16,left=16,bottom=16,right=16]",
      },
      children,
      edges: elkEdges,
    },
    edges,
  };
}

export function orderedGenerationIds(index: GraphIndex, generations: Map<string, number>): Map<number, string[]> {
  return orderGenerations(index, generations);
}

function orderGenerations(index: GraphIndex, generations: Map<string, number>): Map<number, string[]> {
  const byGeneration = new Map<number, GraphPerson[]>();
  for (const person of index.personById.values()) {
    const generation = generations.get(person.id) ?? 0;
    const row = byGeneration.get(generation) ?? [];
    row.push(person);
    byGeneration.set(generation, row);
  }
  const max = Math.max(0, ...generations.values());
  const ordered = new Map<number, string[]>();
  for (let generation = 0; generation <= max; generation += 1) {
    const pool = byGeneration.get(generation) ?? [];
    const seeds: string[] = [];
    const seen = new Set<string>();
    if (generation === 0) {
      for (const person of [...pool].sort((a, b) => byBirth(index, a, b))) seeds.push(person.id);
    } else {
      for (const parentId of ordered.get(generation - 1) ?? []) {
        for (const group of childrenGrouped(index, parentId)) {
          for (const child of group.children) {
            if ((generations.get(child.id) ?? 0) !== generation || seen.has(child.id)) continue;
            seen.add(child.id);
            seeds.push(child.id);
          }
        }
      }
      for (const person of [...pool].sort((a, b) => byBirth(index, a, b))) {
        if (seen.has(person.id)) continue;
        seeds.push(person.id);
      }
    }
    ordered.set(generation, clusterSpouses(seeds, index, generations, generation));
  }
  return ordered;
}

function clusterSpouses(ids: string[], index: GraphIndex, generations: Map<string, number>, generation: number): string[] {
  const ordered: string[] = [];
  const used = new Set<string>();
  const sameGeneration = (partnerId: string) => generations.get(partnerId) === generation && ids.includes(partnerId);

  function pull(id: string, side: "before" | "after") {
    const partners = spouses(index, id)
      .map((entry) => entry.person.id)
      .filter((partnerId) => !used.has(partnerId) && sameGeneration(partnerId));
    for (const partnerId of partners) {
      used.add(partnerId);
      if (side === "before") ordered.splice(Math.max(0, ordered.indexOf(id)), 0, partnerId);
      else ordered.push(partnerId);
      pull(partnerId, side);
    }
  }

  for (const id of ids) {
    if (used.has(id)) continue;
    const partners = spouses(index, id)
      .map((entry) => entry.person.id)
      .filter((partnerId) => !used.has(partnerId) && sameGeneration(partnerId));
    const midpoint = Math.floor(partners.length / 2);
    for (const partnerId of partners.slice(0, midpoint)) {
      used.add(partnerId);
      ordered.push(partnerId);
    }
    used.add(id);
    ordered.push(id);
    for (const partnerId of partners.slice(midpoint)) {
      used.add(partnerId);
      ordered.push(partnerId);
      pull(partnerId, "after");
    }
    for (const partnerId of partners.slice(0, midpoint)) pull(partnerId, "before");
  }
  return ordered;
}

function byBirth(index: GraphIndex, a: GraphPerson | undefined, b: GraphPerson | undefined): number {
  if (!a || !b) return 0;
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) return a.birthDate < b.birthDate ? -1 : 1;
  if (!(a.birthDate && b.birthDate)) {
    const left = orderingYear(index, a.id);
    const right = orderingYear(index, b.id);
    if (left !== null && right !== null && left !== right) return left - right;
    if (left !== null && right === null) return -1;
    if (left === null && right !== null) return 1;
  }
  return a.id.localeCompare(b.id);
}

function parentTooltip(kind: ParentKind): string {
  if (kind === "adoptive") return "Adoptive";
  if (kind === "step") return "Step";
  if (kind === "foster") return "Foster";
  return "Parent";
}
