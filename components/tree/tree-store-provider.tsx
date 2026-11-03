"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import type { TreeGraph } from "@/lib/family-graph";
import { createTreeStore, type TreeStore, type TreeStoreState } from "@/lib/tree-store";

const TreeStoreContext = createContext<TreeStore | null>(null);

export function TreeStoreProvider({ graph, children }: { graph: TreeGraph; children: ReactNode }) {
  const [store] = useState(() => createTreeStore(graph));
  return <TreeStoreContext.Provider value={store}>{children}</TreeStoreContext.Provider>;
}

export function useTreeState<T>(selector: (state: TreeStoreState) => T): T {
  const store = useContext(TreeStoreContext);
  if (!store) throw new Error("Tree store is missing.");
  return useStore(store, selector);
}

export function useTreeApi(): TreeStore {
  const store = useContext(TreeStoreContext);
  if (!store) throw new Error("Tree store is missing.");
  return store;
}
