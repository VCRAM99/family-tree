import { describe, expect, it, vi } from "vitest";

import { createAutosave, type AutosaveTimers } from "@/lib/autosave";

function fakeTimers() {
  let queued: (() => void) | null = null;
  const timers: AutosaveTimers = {
    set(fn) {
      queued = fn;
      return 1;
    },
    clear() {
      queued = null;
    },
  };
  return {
    timers,
    flush() {
      const fn = queued;
      queued = null;
      fn?.();
    },
    pending: () => queued !== null,
  };
}

describe("autosave hook", () => {
  it("debounces and coalesces to the latest value", async () => {
    const clock = fakeTimers();
    const save = vi.fn(async () => {});
    const saver = createAutosave<string>({ delayMs: 600, save, timers: clock.timers });
    saver.push("a");
    saver.push("ab");
    expect(save).not.toHaveBeenCalled();
    clock.flush();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("ab");
    expect(saver.status()).toBe("saved");
  });

  it("writes a value that arrives while a save is in flight", async () => {
    const clock = fakeTimers();
    const pending: (() => void)[] = [];
    const save = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)));
    const saver = createAutosave<string>({ delayMs: 600, save, timers: clock.timers });
    saver.push("one");
    clock.flush();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    saver.push("two");
    clock.flush();
    pending.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("two");
    pending.shift()?.();
    await Promise.resolve();
    expect(saver.status()).toBe("saved");
  });

  it("stays on retry until the failed save succeeds", async () => {
    const clock = fakeTimers();
    let fail = true;
    const save = vi.fn(async () => {
      if (fail) throw new Error("offline");
    });
    const saver = createAutosave<string>({ delayMs: 600, save, timers: clock.timers });
    saver.push("draft");
    clock.flush();
    await Promise.resolve();
    expect(saver.status()).toBe("retry");
    fail = false;
    saver.retry();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.status()).toBe("saved");
  });

  it("keeps a queued save on the person it was typed for", async () => {
    const clock = fakeTimers();
    const writes: string[] = [];
    const saver = createAutosave<string>({
      delayMs: 600,
      save: async (value) => {
        writes.push(`draft:${value}`);
      },
      timers: clock.timers,
    });
    saver.push("new father");
    saver.bindSave(async (value) => {
      writes.push(`someone-else:${value}`);
    });
    clock.flush();
    await Promise.resolve();
    expect(writes).toEqual(["draft:new father"]);
    saver.dispose();
  });

  it("flushes the original person when the selection changes mid-debounce", async () => {
    const clock = fakeTimers();
    const writes: string[] = [];
    const saver = createAutosave<string>({
      delayMs: 600,
      save: async (value) => {
        writes.push(value);
      },
      timers: clock.timers,
    });
    saver.push("original");
    saver.bindSave(async () => {
      writes.push("switched");
    });
    await saver.flush();
    expect(writes).toEqual(["original"]);
    expect(clock.pending()).toBe(false);
    saver.dispose();
  });
});
