"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";

import type { ThemeId } from "@/lib/themes";

type ThemeController = {
  active: ThemeId;
  setPreview: (theme: ThemeId | null) => void;
  setTreeTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeController | null>(null);

export function ThemeRoot({ initialTheme, children }: { initialTheme: ThemeId; children: ReactNode }) {
  const [override, setOverride] = useState<ThemeId | null>(null);
  const [tracked, setTracked] = useState(initialTheme);
  const [preview, setPreview] = useState<ThemeId | null>(null);
  if (tracked !== initialTheme) {
    setTracked(initialTheme);
    setOverride(null);
  }
  const active = preview ?? override ?? initialTheme;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = active;
  }, [active]);

  const setTreeTheme = useCallback((theme: ThemeId) => {
    setOverride(theme);
    setPreview(null);
  }, []);

  return (
    <ThemeContext.Provider value={{ active, setPreview, setTreeTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useAccountTheme(): (theme: ThemeId) => void {
  const controller = useContext(ThemeContext);
  return controller?.setTreeTheme ?? (() => {});
}

