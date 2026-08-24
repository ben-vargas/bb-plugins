import { describe, expect, it } from "vitest";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  applyProjectActivityOrder,
  haveSameOrder,
  sortProjectIdsByLatestThreadUpdate,
} from "./project-activity";

function project(id: string, isPersonal = false): PluginSidebarProject {
  return {
    id,
    name: id,
    isPersonal,
  };
}

function thread(
  id: string,
  projectId: string,
  updatedAt: number,
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id,
    projectId,
    title: id,
    titleFallback: null,
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
    parentThreadId: null,
    ...overrides,
  };
}

describe("sortProjectIdsByLatestThreadUpdate", () => {
  const projects = [project("abc"), project("def"), project("xyz")];

  it("sorts projects by their newest thread update", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(projects, [
        thread("a", "abc", 100),
        thread("d", "def", 300),
        thread("x", "xyz", 200),
      ]),
    ).toEqual(["def", "xyz", "abc"]);
  });

  it("moves a project to the top after one of its threads updates", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(projects, [
        thread("a", "abc", 100),
        thread("d", "def", 300),
        thread("x", "xyz", 400),
      ]),
    ).toEqual(["xyz", "def", "abc"]);
  });

  it("ignores archived threads", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(projects, [
        thread("archived", "abc", 500, { isArchived: true }),
        thread("d", "def", 300),
        thread("x", "xyz", 200),
      ]),
    ).toEqual(["def", "xyz", "abc"]);
  });

  it("retains bb's project order when update times tie", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(projects, [
        thread("a", "abc", 100),
        thread("d", "def", 100),
        thread("x", "xyz", 100),
      ]),
    ).toEqual(["abc", "def", "xyz"]);
  });

  it("uses the persisted sidebar order to break update-time ties", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(
        projects,
        [
          thread("a", "abc", 100),
          thread("d", "def", 100),
          thread("x", "xyz", 100),
        ],
        ["def", "xyz", "abc"],
      ),
    ).toEqual(["def", "xyz", "abc"]);
  });

  it("excludes bb's implicit personal project", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(
        [...projects, project("proj_personal", true)],
        [
          thread("a", "abc", 100),
          thread("personal", "proj_personal", 500),
        ],
      ),
    ).toEqual(["abc", "def", "xyz"]);
  });

  it("counts a nested child toward the root thread's displayed project", () => {
    expect(
      sortProjectIdsByLatestThreadUpdate(projects, [
        thread("root", "abc", 100),
        thread("child", "xyz", 500, { parentThreadId: "root" }),
        thread("d", "def", 300),
      ]),
    ).toEqual(["abc", "def", "xyz"]);
  });
});

describe("applyProjectActivityOrder", () => {
  it("expands bb's legacy projects anchor in activity order", () => {
    expect(
      applyProjectActivityOrder(
        ["pinned", "projects", "threads"],
        ["def", "xyz", "abc"],
      ),
    ).toEqual([
      "pinned",
      "project:def",
      "project:xyz",
      "project:abc",
      "threads",
    ]);
  });

  it("changes only existing project-section slots", () => {
    expect(
      applyProjectActivityOrder(
        [
          "threads",
          "project:abc",
          "pinned",
          "project:def",
          "project:stale",
        ],
        ["def", "abc", "xyz"],
      ),
    ).toEqual([
      "threads",
      "project:def",
      "pinned",
      "project:abc",
      "project:xyz",
    ]);
  });

  it("adds new projects immediately after the last project slot", () => {
    expect(
      applyProjectActivityOrder(
        ["pinned", "project:abc", "threads"],
        ["def", "abc", "xyz"],
      ),
    ).toEqual([
      "pinned",
      "project:def",
      "project:abc",
      "project:xyz",
      "threads",
    ]);
  });

  it("inserts project sections before threads when no project slot exists", () => {
    expect(
      applyProjectActivityOrder(["pinned", "threads"], ["def", "abc"]),
    ).toEqual(["pinned", "project:def", "project:abc", "threads"]);
  });
});

describe("haveSameOrder", () => {
  it("compares complete section order", () => {
    expect(haveSameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(haveSameOrder(["a", "b"], ["b", "a"])).toBe(false);
  });
});
