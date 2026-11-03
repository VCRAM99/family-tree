"use client";

import { useEffect, useMemo, useState } from "react";

import type { TreeGraph } from "@/lib/family-graph";
import { computeLayout, layoutHash, peekLayout, type LayoutResult } from "@/lib/layout";

export function useTreeLayout(graph: TreeGraph): LayoutResult | null {
  const hash = useMemo(() => layoutHash(graph), [graph]);
  const [layout, setLayout] = useState<LayoutResult | null>(() => peekLayout(hash));
  const [tracked, setTracked] = useState(hash);

  if (tracked !== hash) {
    setTracked(hash);
    setLayout(peekLayout(hash));
  }

  useEffect(() => {
    if (peekLayout(hash)) return;
    let cancelled = false;
    const worker = createWorker();
    const apply = (result: LayoutResult) => {
      if (!cancelled) setLayout(result);
    };
    if (!worker) {
      void computeLayout(graph).then(apply);
      return () => {
        cancelled = true;
      };
    }
    worker.onmessage = (event: MessageEvent<{ id: string; result?: LayoutResult }>) => {
      if (cancelled || event.data.id !== hash) return;
      if (event.data.result) apply(event.data.result);
      else void computeLayout(graph).then(apply);
      worker.terminate();
    };
    worker.onerror = () => {
      void computeLayout(graph).then(apply);
      worker.terminate();
    };
    worker.postMessage({ id: hash, graph });
    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [graph, hash]);

  return layout;
}

function createWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  try {
    return new Worker(new URL("../../lib/layout/layout.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}
