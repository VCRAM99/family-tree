export type AutosaveStatus = "idle" | "saving" | "saved" | "retry";

export type AutosaveTimers = {
  set: (fn: () => void) => number;
  clear: (id: number) => void;
};

export type AutosaveController<T> = {
  push: (value: T) => void;
  /** Runs the save captured when the value was pushed, not a later callback. */
  flush: () => Promise<void>;
  retry: () => void;
  /** Rebinds the callback used by future pushes. A queued save keeps its own. */
  bindSave: (save: (value: T) => Promise<void>) => void;
  bindStatus: (onStatus: (status: AutosaveStatus) => void) => void;
  dispose: () => void;
  status: () => AutosaveStatus;
};

const pendingFlushes = new Set<() => Promise<void>>();

/** Flush every mounted field save before the selected person changes. */
export function flushAutosaves(): Promise<void> {
  return Promise.all([...pendingFlushes].map((flush) => flush())).then(() => undefined);
}

/**
 * Debounced save. While a request is in flight, further edits collapse into
 * one follow-up carrying the latest value. The save function is snapshotted
 * at push time so a later person switch cannot redirect the write.
 */
export function createAutosave<T>(options: {
  delayMs?: number;
  delay?: number;
  save: (value: T) => Promise<void>;
  onStatus?: (status: AutosaveStatus) => void;
  timers?: AutosaveTimers;
}): AutosaveController<T> {
  const timers = options.timers ?? {
    set: (fn) => setTimeout(fn, options.delayMs ?? options.delay ?? 600) as unknown as number,
    clear: (id) => clearTimeout(id),
  };

  let save = options.save;
  let onStatus = options.onStatus;
  let status: AutosaveStatus = "idle";
  let latest: { value: T; save: (value: T) => Promise<void> } | null = null;
  let dirty = false;
  let running = false;
  let timer: number | null = null;
  let chain: Promise<void> = Promise.resolve();

  function setStatus(next: AutosaveStatus) {
    status = next;
    onStatus?.(next);
  }

  function clearTimer() {
    if (timer === null) return;
    timers.clear(timer);
    timer = null;
  }

  function run(): Promise<void> {
    if (running) return chain;
    if (!dirty || !latest) return Promise.resolve();
    running = true;
    chain = (async () => {
      try {
        while (dirty && latest) {
          const pending = latest;
          dirty = false;
          setStatus("saving");
          try {
            await pending.save(pending.value);
          } catch {
            dirty = true;
            latest = pending;
            setStatus("retry");
            return;
          }
        }
        if (!dirty) setStatus("saved");
      } finally {
        running = false;
      }
    })();
    return chain;
  }

  function flush(): Promise<void> {
    clearTimer();
    return run();
  }

  const controller: AutosaveController<T> = {
    push(value) {
      latest = { value, save };
      dirty = true;
      clearTimer();
      timer = timers.set(() => {
        timer = null;
        void run();
      });
    },
    flush,
    retry() {
      if (status !== "retry" || !latest) return;
      dirty = true;
      void run();
    },
    bindSave(next) {
      save = next;
    },
    bindStatus(next) {
      onStatus = next;
    },
    dispose() {
      clearTimer();
      pendingFlushes.delete(flush);
    },
    status: () => status,
  };
  pendingFlushes.add(flush);
  return controller;
}
