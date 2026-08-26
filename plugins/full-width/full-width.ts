/**
 * Shared state for the full-width chat toggle.
 *
 * The in-memory value is authoritative for this window; localStorage is only
 * persistence plus cross-window synchronization. That split is what keeps the
 * toggle working when storage is unavailable (private mode, quota, security
 * errors): a failed write leaves the in-memory value — and therefore every
 * same-window subscriber — at the requested state.
 *
 * The value is applied as one attribute on `<html>`, so a single injected
 * stylesheet gates every thread window at once — main thread views, split
 * panes, and embedded ThreadChat panels.
 */

export const FULL_WIDTH_STORAGE_KEY = "bb-plugin-full-width:enabled";
export const STYLE_ELEMENT_ID = "bb-plugin-full-width-style";
export const FULL_WIDTH_ROOT_ATTRIBUTE = "data-bb-plugin-full-width";
export const FULL_WIDTH_CHANGE_EVENT = "bb-plugin-full-width:change";

/**
 * bb caps the chat column (timeline and composer alike) at 760px inside
 * `[data-thread-window]`. Removing the cap while the root attribute is set
 * leaves the column in its normal flex flow, so it still tracks sidebar and
 * right-panel resizes — only the artificial cap goes away.
 *
 * This intentionally targets bb-internal markup (`data-thread-window` and the
 * `max-w-[760px]` utility). If a bb update renames either, the toggle
 * degrades to a no-op rather than breaking anything.
 */
export const FULL_WIDTH_STYLE_TEXT = `html[${FULL_WIDTH_ROOT_ATTRIBUTE}] [data-thread-window] .max-w-\\[760px\\] {
  max-width: none;
}`;

/** This window's authoritative value; null until first read or toggle. */
let memoryEnabled: boolean | null = null;

function readStoredEnabled(): boolean | null {
  try {
    return window.localStorage.getItem(FULL_WIDTH_STORAGE_KEY) === "true";
  } catch {
    return null;
  }
}

export function readFullWidthEnabled(): boolean {
  if (memoryEnabled !== null) {
    return memoryEnabled;
  }
  const stored = readStoredEnabled();
  memoryEnabled = stored ?? false;
  return memoryEnabled;
}

export function applyFullWidthAttribute(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(FULL_WIDTH_ROOT_ATTRIBUTE, "");
  } else {
    document.documentElement.removeAttribute(FULL_WIDTH_ROOT_ATTRIBUTE);
  }
}

export function setFullWidthEnabled(enabled: boolean): void {
  memoryEnabled = enabled;
  try {
    if (enabled) {
      window.localStorage.setItem(FULL_WIDTH_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(FULL_WIDTH_STORAGE_KEY);
    }
  } catch {
    // Persistence and cross-window sync are lost, but the in-memory value
    // keeps this window's toggle fully functional.
  }
  applyFullWidthAttribute(enabled);
  window.dispatchEvent(new CustomEvent(FULL_WIDTH_CHANGE_EVENT));
}

/**
 * Listen for toggle changes from this window (custom event) and from other
 * windows of the same client profile (storage event). Returns unsubscribe.
 */
export function subscribeFullWidth(
  listener: (enabled: boolean) => void,
): () => void {
  const onChange = () => listener(readFullWidthEnabled());
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== FULL_WIDTH_STORAGE_KEY) {
      return;
    }
    // Another window changed (or cleared) the stored value: adopt it. An
    // unreadable store keeps this window's current in-memory value.
    const stored = readStoredEnabled();
    if (stored !== null) {
      memoryEnabled = stored;
    }
    listener(readFullWidthEnabled());
  };
  window.addEventListener(FULL_WIDTH_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FULL_WIDTH_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Test-only: forget the in-memory value so each test starts cold. */
export function resetFullWidthMemoryForTests(): void {
  memoryEnabled = null;
}
