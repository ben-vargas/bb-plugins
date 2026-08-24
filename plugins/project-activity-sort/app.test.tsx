// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { SIDEBAR_SECTION_ORDER_KEY } from "./project-activity";

function project(id: string): PluginSidebarProject {
  return {
    id,
    name: id,
    isPersonal: false,
  };
}

function thread(
  id: string,
  projectId: string,
  updatedAt: number,
): PluginSidebarThread {
  return {
    id,
    projectId,
    title: id,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt,
    lastReadAt: null,
    latestAttentionAt: updatedAt,
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("project activity sidebar wrapper", () => {
  it("renders bb's original sidebar unchanged and synchronizes project order", async () => {
    window.localStorage.setItem(
      SIDEBAR_SECTION_ORDER_KEY,
      JSON.stringify([
        "pinned",
        "project:abc",
        "project:def",
        "project:xyz",
        "threads",
      ]),
    );

    const loaded = await loadPluginApp(() => import("./app"));

    renderSlot(
      loaded.threadLists[0]!,
      {
        activeThreadId: null,
        activeProjectId: null,
        isCompactViewport: false,
        onNavigate: vi.fn(),
        searchQuery: "",
        experimental_Original: () => (
          <nav aria-label="BB original sidebar">
            <span data-testid="baseline-unread" />
            <span data-testid="baseline-activity-spinner" />
            BB original sidebar
          </nav>
        ),
      },
      {
        sidebarThreads: {
          status: "ready",
          projects: [project("abc"), project("def"), project("xyz")],
          threads: [
            thread("a", "abc", 100),
            thread("d", "def", 300),
            thread("x", "xyz", 200),
          ],
        },
      },
    );

    expect(screen.getByLabelText("BB original sidebar")).toBeTruthy();
    expect(screen.getByTestId("baseline-unread")).toBeTruthy();
    expect(screen.getByTestId("baseline-activity-spinner")).toBeTruthy();

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(SIDEBAR_SECTION_ORDER_KEY) ?? "[]",
        ),
      ).toEqual([
        "pinned",
        "project:def",
        "project:xyz",
        "project:abc",
        "threads",
      ]);
    });
  });

  it("does not change sidebar order before sidebar data is ready", async () => {
    const initialOrder = JSON.stringify(["pinned", "projects", "threads"]);
    window.localStorage.setItem(SIDEBAR_SECTION_ORDER_KEY, initialOrder);
    const loaded = await loadPluginApp(() => import("./app"));

    renderSlot(
      loaded.threadLists[0]!,
      {
        activeThreadId: null,
        activeProjectId: null,
        isCompactViewport: false,
        onNavigate: vi.fn(),
        searchQuery: "",
        experimental_Original: () => <div>BB original loading state</div>,
      },
      {
        sidebarThreads: {
          status: "loading",
          projects: [],
          threads: [],
        },
      },
    );

    expect(screen.getByText("BB original loading state")).toBeTruthy();
    expect(window.localStorage.getItem(SIDEBAR_SECTION_ORDER_KEY)).toBe(
      initialOrder,
    );
  });

  it("notifies bb's same-window storage subscriber", async () => {
    window.localStorage.setItem(
      SIDEBAR_SECTION_ORDER_KEY,
      JSON.stringify(["project:abc", "project:def", "threads"]),
    );
    const listener = vi.fn();
    window.addEventListener("storage", listener);
    await loadPluginApp(() => import("./app"));
    const { synchronizeBaselineProjectOrder } = await import("./app");

    expect(synchronizeBaselineProjectOrder(["def", "abc"])).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    const event = listener.mock.calls[0]?.[0] as StorageEvent;
    expect(event.key).toBe(SIDEBAR_SECTION_ORDER_KEY);
    expect(event.newValue).toBe(
      JSON.stringify(["project:def", "project:abc", "threads"]),
    );

    window.removeEventListener("storage", listener);
  });

  it("does not notify bb when the requested order is already stored", async () => {
    const storedOrder = JSON.stringify([
      "pinned",
      "project:def",
      "project:abc",
      "threads",
    ]);
    window.localStorage.setItem(SIDEBAR_SECTION_ORDER_KEY, storedOrder);
    const listener = vi.fn();
    window.addEventListener("storage", listener);
    await loadPluginApp(() => import("./app"));
    const { synchronizeBaselineProjectOrder } = await import("./app");

    expect(synchronizeBaselineProjectOrder(["def", "abc"])).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_SECTION_ORDER_KEY)).toBe(
      storedOrder,
    );
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("storage", listener);
  });
});
