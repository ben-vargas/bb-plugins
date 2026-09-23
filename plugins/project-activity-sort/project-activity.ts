/** The fields of bb's project DTO this plugin reads. */
export interface ActivityProject {
  id: string;
  kind: "standard" | "personal";
}

/** The fields of bb's thread DTO this plugin reads. */
export interface ActivityThread {
  id: string;
  projectId: string;
  parentThreadId: string | null;
  archivedAt: number | null;
  updatedAt: number;
}

export const PROJECT_SECTION_PREFIX = "project:";

function getDisplayedProjectId(
  thread: ActivityThread,
  threadsById: ReadonlyMap<string, ActivityThread>,
): string {
  let current = thread;
  const visited = new Set<string>([thread.id]);

  while (current.parentThreadId) {
    if (visited.has(current.parentThreadId)) {
      break;
    }

    const parent = threadsById.get(current.parentThreadId);
    if (!parent) {
      break;
    }

    visited.add(parent.id);
    current = parent;
  }

  return current.projectId;
}

/**
 * Orders projects by the newest non-archived thread displayed in each project.
 * Ties retain bb's existing project order.
 */
export function sortProjectIdsByLatestThreadUpdate(
  projects: readonly ActivityProject[],
  threads: readonly ActivityThread[],
  existingProjectOrder: readonly string[] = [],
): string[] {
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
  const latestUpdateByProject = new Map<string, number>();
  const existingOrderIndex = new Map<string, number>();

  for (const [index, projectId] of existingProjectOrder.entries()) {
    if (!existingOrderIndex.has(projectId)) {
      existingOrderIndex.set(projectId, index);
    }
  }

  for (const thread of threads) {
    if (thread.archivedAt !== null) {
      continue;
    }

    const displayedProjectId = getDisplayedProjectId(thread, threadsById);
    const currentLatest = latestUpdateByProject.get(displayedProjectId) ?? 0;
    latestUpdateByProject.set(
      displayedProjectId,
      Math.max(currentLatest, thread.updatedAt),
    );
  }

  return projects
    .filter((project) => project.kind !== "personal")
    .map((project, index) => ({
      id: project.id,
      tieIndex:
        existingOrderIndex.get(project.id) ??
        existingProjectOrder.length + index,
      latestUpdate: latestUpdateByProject.get(project.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.latestUpdate - left.latestUpdate || left.tieIndex - right.tieIndex,
    )
    .map(({ id }) => id);
}

/**
 * Replaces only project-section entries, leaving every non-project sidebar
 * section in its current position and order.
 */
export function applyProjectActivityOrder(
  storedOrder: readonly string[],
  sortedProjectIds: readonly string[],
): string[] {
  const desiredProjectSections = sortedProjectIds.map(
    (projectId) => `${PROJECT_SECTION_PREFIX}${projectId}`,
  );

  const legacyProjectsIndex = storedOrder.indexOf("projects");
  if (legacyProjectsIndex >= 0) {
    const withoutProjectSections = storedOrder.filter(
      (sectionId) => !sectionId.startsWith(PROJECT_SECTION_PREFIX),
    );
    const normalizedProjectsIndex = withoutProjectSections.indexOf("projects");

    return [
      ...withoutProjectSections.slice(0, normalizedProjectsIndex),
      ...desiredProjectSections,
      ...withoutProjectSections.slice(normalizedProjectsIndex + 1),
    ];
  }

  const desiredQueue = [...desiredProjectSections];
  const nextOrder: string[] = [];
  let lastProjectInsertionIndex = -1;

  for (const sectionId of storedOrder) {
    if (sectionId.startsWith(PROJECT_SECTION_PREFIX)) {
      const replacement = desiredQueue.shift();
      if (replacement) {
        nextOrder.push(replacement);
        lastProjectInsertionIndex = nextOrder.length;
      }
      continue;
    }

    nextOrder.push(sectionId);
  }

  if (desiredQueue.length > 0) {
    const threadsIndex = nextOrder.indexOf("threads");
    const insertionIndex =
      lastProjectInsertionIndex >= 0
        ? lastProjectInsertionIndex
        : threadsIndex >= 0
          ? threadsIndex
          : nextOrder.length;

    nextOrder.splice(insertionIndex, 0, ...desiredQueue);
  }

  return nextOrder;
}

export function haveSameOrder(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((sectionId, index) => sectionId === right[index])
  );
}
