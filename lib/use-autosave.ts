"use client";

import { useEffect, useState } from "react";
import { createAutosave, type AutosaveStatus } from "@/lib/autosave";

export function useAutosave<T>(save: (value: T) => Promise<void>, delay = 600) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [saver] = useState(() => createAutosave<T>({ delayMs: delay, save, onStatus: setStatus }));
  saver.bindSave(save);
  saver.bindStatus(setStatus);

  useEffect(() => () => saver.dispose(), [saver]);

  return { status, push: saver.push, flush: saver.flush, retry: saver.retry };
}
