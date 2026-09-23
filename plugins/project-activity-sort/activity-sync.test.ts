import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSyncScheduler,
  syncProjectActivityOrder,
  type ProjectActivitySource,
} from "./activity-sync";
import type { ActivityProject, ActivityThread } from "./project-activity";

function project(id: string): ActivityProject {
  return { id, kind: "standard" };
}

function thread(id: string, projectId: string, updatedAt: number): ActivityThread {
  return { id, projectId, parentThreadId: null, archivedAt: null, updatedAt };
}

function createSource(
  storedOrder: string[],
  threads: ActivityThread[],
): ProjectActivitySource & { writes: string[][] } {
  const writes: string[][] = [];
  return {
    writes,
    listProjects: async () => [project("abc"), project("def"), project("xyz")],
    listThreads: async () => threads,
    readSectionOrder: async () => storedOrder,
    writeSectionOrder: async (order) => {
      writes.push([...order]);
    },
  };
}

describe("syncProjectActivityOrder", () => {
  it("writes the activity order into the stored section order", async () => {
    const source = createSource(
      ["pinned", "project:abc", "project:def", "project:xyz", "threads"],
      [thread("a", "abc", 100), thread("x", "xyz", 300), thread("d", "def", 200)],
    );

    await expect(syncProjectActivityOrder(source)).resolves.toEqual([
      "pinned",
      "project:xyz",
      "project:def",
      "project:abc",
      "threads",
    ]);
    expect(source.writes).toHaveLength(1);
  });

  it("does not write when the order is already current", async () => {
    const source = createSource(
      ["pinned", "project:xyz", "project:def", "project:abc", "threads"],
      [thread("a", "abc", 100), thread("x", "xyz", 300), thread("d", "def", 200)],
    );

    await expect(syncProjectActivityOrder(source)).resolves.toBeNull();
    expect(source.writes).toEqual([]);
  });

  it("expands the default projects anchor", async () => {
    const source = createSource(
      ["pinned", "projects", "threads"],
      [thread("d", "def", 200)],
    );

    await expect(syncProjectActivityOrder(source)).resolves.toEqual([
      "pinned",
      "project:def",
      "project:abc",
      "project:xyz",
      "threads",
    ]);
  });
});

describe("createSyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of requests into one run", async () => {
    const run = vi.fn(async () => {});
    const scheduler = createSyncScheduler(run, {
      debounceMs: 100,
      retryMs: 1_000,
      onError: vi.fn(),
    });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs once more when a request arrives mid-run", async () => {
    let release: () => void = () => {};
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const scheduler = createSyncScheduler(run, {
      debounceMs: 100,
      retryMs: 1_000,
      onError: vi.fn(),
    });

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(100);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed run", async () => {
    const onError = vi.fn();
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("thread-list not running"))
      .mockResolvedValue(undefined);
    const scheduler = createSyncScheduler(run, {
      debounceMs: 100,
      retryMs: 1_000,
      onError,
    });

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stops after dispose", async () => {
    const run = vi.fn(async () => {});
    const scheduler = createSyncScheduler(run, {
      debounceMs: 100,
      retryMs: 1_000,
      onError: vi.fn(),
    });

    scheduler.schedule();
    scheduler.dispose();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(run).not.toHaveBeenCalled();
  });
});
