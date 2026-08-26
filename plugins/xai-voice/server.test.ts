import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

describe("server factory", () => {
  it("registers the xai-voice AI service without throwing", async () => {
    // Guards against reserved service ids: registering e.g. "xai" throws
    // in the SDK's assertAiServiceRegistrable, which only a real register
    // call exercises.
    const { bb } = createFakePluginHost({ pluginId: "xai-voice" });
    await expect(Promise.resolve(plugin(bb))).resolves.not.toThrow();
  });
});
