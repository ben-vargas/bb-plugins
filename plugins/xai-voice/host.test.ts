import { afterEach, describe, expect, it, vi } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "./host.js";

const BASE_INPUT = {
  audioBase64: Buffer.from("bytes").toString("base64"),
  mimeType: "audio/webm",
  filename: "clip.webm",
  timeoutMs: 5000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("host entry", () => {
  it("transcribes through the contract with an API key", async () => {
    vi.stubEnv("XAI_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ text: "hi there" }), { status: 200 }),
      ),
    );
    const harness = experimental_createHostEntryHarness(hostEntry);
    const result = await harness.experimental_call(
      "xai.voice.transcribe",
      BASE_INPUT,
    );
    expect(result).toEqual({ ok: true, text: "hi there" });
    await harness.experimental_dispose();
  });

  it("reports ready when an API key is set", async () => {
    vi.stubEnv("XAI_API_KEY", "sk-test");
    const harness = experimental_createHostEntryHarness(hostEntry);
    expect(await harness.experimental_call("xai.voice.status", {})).toEqual({
      ready: true,
    });
    await harness.experimental_dispose();
  });

  it("reports not ready with no API key and no Grok session", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("GROK_AUTH_PATH", "/nonexistent/xai-voice-test/auth.json");
    const harness = experimental_createHostEntryHarness(hostEntry);
    expect(await harness.experimental_call("xai.voice.status", {})).toEqual({
      ready: false,
      message: expect.stringContaining("XAI_API_KEY"),
    });
    await harness.experimental_dispose();
  });
});
