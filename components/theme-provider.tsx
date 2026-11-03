"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { ThemeId } from "@/lib/themes";

type ThemeController = {
  active: ThemeId;
  setPreview: (theme: ThemeId | null) => void;
  setTreeTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeController | null>(null);

export function ThemeRoot({ initialTheme, children }: { initialTheme: ThemeId; children: ReactNode }) {
  const pathname = usePathname();
  const [treeTheme, setTreeThemeState] = useState(initialTheme);
  const [preview, setPreview] = useState<ThemeId | null>(null);
  const onTree = pathname.startsWith("/tree/");
  const active = preview ?? (onTree ? treeTheme : "system");

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = active;
  }, [active]);

  const setTreeTheme = useCallback((theme: ThemeId) => {
    setTreeThemeState(theme);
    setPreview(null);
  }, []);

  return (
    <ThemeContext.Provider value={{ active, setPreview, setTreeTheme }}>{children}</ThemeContext.Provider>
  );
}

export function PublishTreeTheme({ theme }: { theme: ThemeId }) {
  const setTreeTheme = useContext(ThemeContext)?.setTreeTheme;
  useLayoutEffect(() => {
    setTreeTheme?.(theme);
  }, [setTreeTheme, theme]);
  return null;
}

export function useThemePreview(): (theme: ThemeId | null) => void {
  const controller = useContext(ThemeContext);
  return controller?.setPreview ?? (() => {});
}
