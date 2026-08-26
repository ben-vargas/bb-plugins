// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import {
  applyFullWidthAttribute,
  FULL_WIDTH_ROOT_ATTRIBUTE,
  FULL_WIDTH_STORAGE_KEY,
  resetFullWidthMemoryForTests,
  setFullWidthEnabled,
  STYLE_ELEMENT_ID,
} from "./full-width";

const headerProps = {
  threadId: "thr_1",
  projectId: "proj_1",
  isCompactViewport: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetFullWidthMemoryForTests();
  applyFullWidthAttribute(false);
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
});

describe("full-width plugin app", () => {
  it("registers one content script and one thread header action", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.contentScripts.map((script) => script.id)).toEqual([
      "full-width-style",
    ]);
    expect(app.threadHeaderActions.map((action) => action.id)).toEqual([
      "full-width-toggle",
    ]);
  });

  it("injects the stylesheet, applies the stored state, and cleans up", async () => {
    window.localStorage.setItem(FULL_WIDTH_STORAGE_KEY, "true");
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "full-width",
    });

    expect(document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);

    await scripts.lifecycle.dispose();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(false);
  });

  it("follows toggles made after mount", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "full-width",
    });

    setFullWidthEnabled(true);
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);
    setFullWidthEnabled(false);
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(false);

    await scripts.lifecycle.dispose();
  });

  it("toggles state and persists from the header button", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(app.threadHeaderActions[0]!, headerProps);

    const button = slot.getByRole("button", { name: "Full width chat" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toBe("Enable full width");

    fireEvent.click(button);
    expect(window.localStorage.getItem(FULL_WIDTH_STORAGE_KEY)).toBe("true");
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Disable full width");

    fireEvent.click(button);
    expect(window.localStorage.getItem(FULL_WIDTH_STORAGE_KEY)).toBeNull();
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    slot.lifecycle.unmount();
  });

  it("keeps two mounted header instances in sync (split panes)", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const paneA = renderSlot(app.threadHeaderActions[0]!, headerProps);
    const paneB = renderSlot(app.threadHeaderActions[0]!, {
      ...headerProps,
      threadId: "thr_2",
    });

    const buttonA = within(paneA.container).getByRole("button", {
      name: "Full width chat",
    });
    const buttonB = within(paneB.container).getByRole("button", {
      name: "Full width chat",
    });

    fireEvent.click(buttonA);
    expect(buttonA.getAttribute("aria-pressed")).toBe("true");
    expect(buttonB.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(buttonB);
    expect(buttonA.getAttribute("aria-pressed")).toBe("false");
    expect(buttonB.getAttribute("aria-pressed")).toBe("false");

    paneA.lifecycle.unmount();
    paneB.lifecycle.unmount();
  });

  it("keeps the toggle working when storage throws (private mode)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "full-width",
    });
    const slot = renderSlot(app.threadHeaderActions[0]!, headerProps);

    const button = slot.getByRole("button", { name: "Full width chat" });
    fireEvent.click(button);
    // The in-memory value keeps this window functional: the button stays
    // pressed and the content script keeps the attribute applied.
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(false);

    slot.lifecycle.unmount();
    await scripts.lifecycle.dispose();
  });
});
