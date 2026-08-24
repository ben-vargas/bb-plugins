import { useEffect, useMemo } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreads,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import {
  applyProjectActivityOrder,
  DEFAULT_SIDEBAR_SECTION_ORDER,
  haveSameOrder,
  SIDEBAR_SECTION_ORDER_KEY,
  sortProjectIdsByLatestThreadUpdate,
} from "./project-activity";

function readStoredSidebarOrder(value: string | null): string[] {
  if (value === null) {
    return [...DEFAULT_SIDEBAR_SECTION_ORDER];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every((sectionId) => typeof sectionId === "string")
    ) {
      return parsed;
    }
  } catch {
    // Fall through to bb's default order when the stored value is invalid.
  }

  return [...DEFAULT_SIDEBAR_SECTION_ORDER];
}

function readCurrentProjectOrder(): string[] {
  try {
    return readStoredSidebarOrder(
      window.localStorage.getItem(SIDEBAR_SECTION_ORDER_KEY),
    )
      .filter((sectionId) => sectionId.startsWith("project:"))
      .map((sectionId) => sectionId.slice("project:".length));
  } catch {
    return [];
  }
}

export function synchronizeBaselineProjectOrder(
  sortedProjectIds: readonly string[],
): boolean {
  try {
    const oldValue = window.localStorage.getItem(SIDEBAR_SECTION_ORDER_KEY);
    const storedOrder = readStoredSidebarOrder(oldValue);
    const nextOrder = applyProjectActivityOrder(storedOrder, sortedProjectIds);

    if (haveSameOrder(storedOrder, nextOrder)) {
      return false;
    }

    const newValue = JSON.stringify(nextOrder);
    window.localStorage.setItem(SIDEBAR_SECTION_ORDER_KEY, newValue);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SIDEBAR_SECTION_ORDER_KEY,
        oldValue,
        newValue,
        storageArea: window.localStorage,
        url: window.location.href,
      }),
    );

    return true;
  } catch {
    // The original sidebar remains fully functional if storage is unavailable.
    return false;
  }
}

function BaselineProjectActivityList({
  experimental_Original: Original,
}: PluginThreadListProps) {
  const sidebarState = experimental_useSidebarThreads();
  const sortedProjectIds = useMemo(
    () =>
      sortProjectIdsByLatestThreadUpdate(
        sidebarState.projects,
        sidebarState.threads,
        readCurrentProjectOrder(),
      ),
    [sidebarState.projects, sidebarState.threads],
  );
  const projectOrderSignature = sortedProjectIds.join("\u0000");

  useEffect(() => {
    if (sidebarState.status === "ready") {
      synchronizeBaselineProjectOrder(sortedProjectIds);
    }
  }, [projectOrderSignature, sidebarState.status]);

  return <Original />;
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "project-activity-sort",
    title: "Projects by recent activity",
    description:
      "Uses bb's original sidebar and orders project sections by latest thread update.",
    component: BaselineProjectActivityList,
  });
});
