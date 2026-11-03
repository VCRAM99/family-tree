import { createStore } from "zustand/vanilla";

import { createGraphIndex, type GraphIndex, type TreeGraph } from "@/lib/family-graph";

export type TreeStoreState = {
  graph: TreeGraph;
  index: GraphIndex;
  replaceGraph: (graph: TreeGraph) => void;
  /** Applies a mutation to a clone and returns the previous graph for rollback. */
  apply: (recipe: (graph: TreeGraph) => void) => TreeGraph;
  rollback: (previous: TreeGraph) => void;
};

export function createTreeStore(graph: TreeGraph) {
  return createStore<TreeStoreState>((set, get) => ({
    graph,
    index: createGraphIndex(graph),
    replaceGraph(next) {
      set({ graph: next, index: createGraphIndex(next) });
    },
    apply(recipe) {
      const previous = get().graph;
      const next = structuredClone(previous);
      recipe(next);
      set({ graph: next, index: createGraphIndex(next) });
      return previous;
    },
    rollback(previous) {
      set({ graph: previous, index: createGraphIndex(previous) });
    },
  }));
}

export type TreeStore = ReturnType<typeof createTreeStore>;
