import { useSyncExternalStore } from "react";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import {
  applyFullWidthAttribute,
  FULL_WIDTH_STYLE_TEXT,
  readFullWidthEnabled,
  setFullWidthEnabled,
  STYLE_ELEMENT_ID,
  subscribeFullWidth,
} from "./full-width";

function subscribe(onStoreChange: () => void): () => void {
  return subscribeFullWidth(onStoreChange);
}

function FullWidthGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M3 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm18 0a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1ZM8.7 8.3a1 1 0 0 1 0 1.4L7.4 11h9.2l-1.3-1.3a1 1 0 1 1 1.4-1.4l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 1 1-1.4-1.4l1.3-1.3H7.4l1.3 1.3a1 1 0 1 1-1.4 1.4l-3-3a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

export function FullWidthToggle() {
  const enabled = useSyncExternalStore(subscribe, readFullWidthEnabled);

  return (
    <button
      type="button"
      aria-label="Full width chat"
      aria-pressed={enabled}
      title={enabled ? "Disable full width" : "Enable full width"}
      onClick={() => setFullWidthEnabled(!enabled)}
      className={
        enabled
          ? "inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          : "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      }
    >
      <FullWidthGlyph />
    </button>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "full-width-style",
    mount() {
      const style = document.createElement("style");
      style.id = STYLE_ELEMENT_ID;
      style.textContent = FULL_WIDTH_STYLE_TEXT;
      document.head.appendChild(style);
      applyFullWidthAttribute(readFullWidthEnabled());
      const unsubscribe = subscribeFullWidth(applyFullWidthAttribute);
      return () => {
        unsubscribe();
        applyFullWidthAttribute(false);
        style.remove();
      };
    },
  });

  app.slots.experimental_threadHeaderAction({
    id: "full-width-toggle",
    title: "Full width",
    component: FullWidthToggle,
  });
});
