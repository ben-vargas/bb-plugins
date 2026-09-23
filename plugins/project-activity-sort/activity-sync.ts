import {
  type ActivityProject,
  type ActivityThread,
  applyProjectActivityOrder,
  haveSameOrder,
  PROJECT_SECTION_PREFIX,
  sortProjectIdsByLatestThreadUpdate,
} from "./project-activity";

export interface ProjectActivitySource {
  listProjects(): Promise<readonly ActivityProject[]>;
  listThreads(): Promise<readonly ActivityThread[]>;
  /** The thread-list plugin's `sectionOrder` preference. */
  readSectionOrder(): Promise<readonly string[]>;
  writeSectionOrder(order: readonly string[]): Promise<void>;
}

/**
 * Reads bb's projects, threads, and sidebar section order, then writes the
 * section order back only when project activity changes it. Returns the
 * written order, or null when nothing changed.
 */
export async function syncProjectActivityOrder(
  source: ProjectActivitySource,
): Promise<string[] | null> {
  const [projects, threads, storedOrder] = await Promise.all([
    source.listProjects(),
    source.listThreads(),
    source.readSectionOrder(),
  ]);

  const currentProjectOrder = storedOrder
    .filter((sectionId) => sectionId.startsWith(PROJECT_SECTION_PREFIX))
    .map((sectionId) => sectionId.slice(PROJECT_SECTION_PREFIX.length));
  const sortedProjectIds = sortProjectIdsByLatestThreadUpdate(
    projects,
    threads,
    currentProjectOrder,
  );
  if (sortedProjectIds.length === 0) {
    return null;
  }

  const nextOrder = applyProjectActivityOrder(storedOrder, sortedProjectIds);
  if (haveSameOrder(storedOrder, nextOrder)) {
    return null;
  }

  await source.writeSectionOrder(nextOrder);
  return nextOrder;
}

export interface SyncSchedulerOptions {
  /** Trailing debounce applied to bursts of thread events. */
  debounceMs: number;
  /** Delay before retrying after a failed run. */
  retryMs: number;
  onError(error: unknown): void;
}

/**
 * Coalesces sync requests into one trailing run and never runs two syncs at
 * once; a request that arrives mid-run schedules one follow-up run.
 */
export function createSyncScheduler(
  run: () => Promise<unknown>,
  options: SyncSchedulerOptions,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let rerun = false;
  let disposed = false;

  function arm(delayMs: number) {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void execute();
    }, delayMs);
  }

  async function execute() {
    if (disposed) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    let failed = false;
    try {
      await run();
    } catch (error) {
      failed = true;
      options.onError(error);
    } finally {
      running = false;
    }
    if (rerun) {
      rerun = false;
      arm(options.debounceMs);
    } else if (failed && timer === null) {
      arm(options.retryMs);
    }
  }

  return {
    schedule() {
      arm(options.debounceMs);
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
