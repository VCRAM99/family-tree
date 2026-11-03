"use client";

import { createContext } from "react";

import type { PersonField } from "@/lib/domain";
import type { AddRole } from "@/components/tree/family-column";

export type CanvasLod = "full" | "name" | "dot";

export type CanvasChrome = {
  lod: CanvasLod;
  personId: string | null;
  focusId: string | null;
  neighbors: Set<string>;
  matches: Set<string> | null;
  editing: boolean;
  photosEnabled: boolean;
  visibleFields: PersonField[];
  viewerId: string | null;
  onOpen: (personId: string) => void;
  onFocus: (personId: string) => void;
  onAdd: (role: AddRole, personId: string) => void;
};

export const CanvasContext = createContext<CanvasChrome | null>(null);
