import type { TreeGraph } from "@/lib/family-graph";

import { computeLayout } from "./compute";
import type { LayoutResult } from "./types";

type Incoming = { id: string; graph: TreeGraph };
type Outgoing = { id: string; result?: LayoutResult; error?: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
  postMessage: (message: Outgoing) => void;
};

scope.onmessage = (event) => {
  const { id, graph } = event.data;
  void computeLayout(graph)
    .then((result) => {
      scope.postMessage({ id, result });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Could not arrange the tree.";
      scope.postMessage({ id, error: message });
    });
};
