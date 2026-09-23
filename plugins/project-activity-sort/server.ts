import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  createSyncScheduler,
  syncProjectActivityOrder,
  type ProjectActivitySource,
} from "./activity-sync";

// bb's sidebar list is the bundled thread-list plugin, which owns the
// server-synced `sectionOrder` preference and publishes changes to every
// open window.
const THREAD_LIST_PLUGIN_ID = "thread-list";

const DEBOUNCE_MS = 1_500;
const RETRY_MS = 15_000;
const SWEEP_MS = 5 * 60_000;

const THREAD_EVENTS = [
  "thread.created",
  "thread.active",
  "thread.idle",
  "thread.failed",
  "thread.archived",
  "thread.unarchived",
  "thread.deleted",
  "experimental_thread.events",
] as const;

const sectionOrderSchema = z.array(z.string());
const listPreferencesSchema = z.object({
  preferences: z.object({ sectionOrder: sectionOrderSchema }).passthrough(),
});
const setPreferenceSchema = z.object({ key: z.string(), value: z.unknown() });

function createSource(bb: BbPluginApi): ProjectActivitySource {
  return {
    async listProjects() {
      return bb.sdk.projects.list();
    },
    async listThreads() {
      return bb.sdk.threads.list({ archived: false });
    },
    async readSectionOrder() {
      const { preferences } = await bb.sdk.plugins.callRpc({
        pluginId: THREAD_LIST_PLUGIN_ID,
        method: "listPreferences",
        input: null,
        outputSchema: listPreferencesSchema,
      });
      return preferences.sectionOrder;
    },
    async writeSectionOrder(order) {
      await bb.sdk.plugins.callRpc({
        pluginId: THREAD_LIST_PLUGIN_ID,
        method: "setPreference",
        input: { key: "sectionOrder", value: [...order] },
        outputSchema: setPreferenceSchema,
      });
    },
  };
}

export default function plugin(bb: BbPluginApi) {
  const source = createSource(bb);
  const scheduler = createSyncScheduler(
    async () => {
      const written = await syncProjectActivityOrder(source);
      if (written !== null) {
        bb.log.debug(`reordered project sections: ${written.join(", ")}`);
      }
    },
    {
      debounceMs: DEBOUNCE_MS,
      retryMs: RETRY_MS,
      onError(error) {
        bb.log.warn(
          `could not sync project order: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    },
  );

  for (const event of THREAD_EVENTS) {
    bb.events.on(event, () => scheduler.schedule());
  }

  // Events cover live activity; the sweep catches anything they miss, such
  // as project changes and threads updated while the plugin was stopped.
  const sweep = setInterval(() => scheduler.schedule(), SWEEP_MS);
  scheduler.schedule();

  bb.onDispose(() => {
    clearInterval(sweep);
    scheduler.dispose();
  });

  bb.log.info("project activity sort registered");
}
