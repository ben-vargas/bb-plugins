// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyFullWidthAttribute,
  FULL_WIDTH_ROOT_ATTRIBUTE,
  FULL_WIDTH_STORAGE_KEY,
  FULL_WIDTH_STYLE_TEXT,
  readFullWidthEnabled,
  resetFullWidthMemoryForTests,
  setFullWidthEnabled,
  subscribeFullWidth,
} from "./full-width";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetFullWidthMemoryForTests();
  applyFullWidthAttribute(false);
});

describe("full-width state", () => {
  it("defaults to disabled", () => {
    expect(readFullWidthEnabled()).toBe(false);
  });

  it("persists, applies the root attribute, and notifies subscribers", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeFullWidth((enabled) => seen.push(enabled));

    setFullWidthEnabled(true);
    expect(window.localStorage.getItem(FULL_WIDTH_STORAGE_KEY)).toBe("true");
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);
    expect(readFullWidthEnabled()).toBe(true);

    setFullWidthEnabled(false);
    expect(window.localStorage.getItem(FULL_WIDTH_STORAGE_KEY)).toBeNull();
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(false);

    expect(seen).toEqual([true, false]);
    unsubscribe();
    setFullWidthEnabled(true);
    expect(seen).toEqual([true, false]);
  });

  it("stays enabled when storage writes throw (private mode / quota)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const seen: boolean[] = [];
    const unsubscribe = subscribeFullWidth((enabled) => seen.push(enabled));

    setFullWidthEnabled(true);
    // The in-memory value is authoritative: subscribers see true and the
    // attribute stays applied even though nothing persisted.
    expect(seen).toEqual([true]);
    expect(readFullWidthEnabled()).toBe(true);
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);

    setFullWidthEnabled(false);
    expect(seen).toEqual([true, false]);
    expect(readFullWidthEnabled()).toBe(false);
    unsubscribe();
  });

  it("works when storage reads throw (blocked storage)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(readFullWidthEnabled()).toBe(false);

    setFullWidthEnabled(true);
    expect(readFullWidthEnabled()).toBe(true);
    expect(
      document.documentElement.hasAttribute(FULL_WIDTH_ROOT_ATTRIBUTE),
    ).toBe(true);
  });

  it("reacts to storage events from other windows", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFullWidth(listener);

    window.localStorage.setItem(FULL_WIDTH_STORAGE_KEY, "true");
    window.dispatchEvent(
      new StorageEvent("storage", { key: FULL_WIDTH_STORAGE_KEY }),
    );
    expect(listener).toHaveBeenLastCalledWith(true);
    expect(readFullWidthEnabled()).toBe(true);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "unrelated-key" }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("adopts a cross-window clear (storage event with key null)", () => {
    setFullWidthEnabled(true);
    window.localStorage.clear();

    const listener = vi.fn();
    const unsubscribe = subscribeFullWidth(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenLastCalledWith(false);
    expect(readFullWidthEnabled()).toBe(false);
    unsubscribe();
  });

  it("keeps the in-memory value when a storage event arrives but reads throw", () => {
    setFullWidthEnabled(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    const listener = vi.fn();
    const unsubscribe = subscribeFullWidth(listener);
    window.dispatchEvent(
      new StorageEvent("storage", { key: FULL_WIDTH_STORAGE_KEY }),
    );
    expect(listener).toHaveBeenLastCalledWith(true);
    unsubscribe();
  });

  it("targets bb's thread window column cap and nothing else", () => {
    expect(FULL_WIDTH_STYLE_TEXT).toContain(
      `html[${FULL_WIDTH_ROOT_ATTRIBUTE}] [data-thread-window] .max-w-\\[760px\\]`,
    );
    expect(FULL_WIDTH_STYLE_TEXT).toContain("max-width: none");
  });
});
