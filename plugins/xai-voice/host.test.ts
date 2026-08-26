import { afterEach, describe, expect, it, vi } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "./host.js";

const BASE_INPUT = {
  serviceId: "xai-voice",
  model: "grok-stt",
  audioBase64: Buffer.from("bytes").toString("base64"),
  mimeType: "audio/webm",
  filename: "clip.webm",
  prompt: null,
  timeoutMs: 5000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("host entry", () => {
  it("declines a foreign service id without touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const harness = experimental_createHostEntryHarness(hostEntry);
    const result = await harness.experimental_call("ai.voice.transcribe", {
      ...BASE_INPUT,
      serviceId: "some-other-service",
    });
    expect(result).toMatchObject({ ok: false, code: "request_failed" });
    expect(fetchSpy).not.toHaveBeenCalled();
    await harness.experimental_dispose();
  });

  it("declines helper inference (voice-only plugin)", async () => {
    const harness = experimental_createHostEntryHarness(hostEntry);
    const result = await harness.experimental_call("ai.inference.complete", {
      serviceId: "xai-voice",
      model: "grok-stt",
      reasoningEffort: "none",
      prompt: "title this",
      outputSchema: { type: "object" },
      timeoutMs: 5000,
    });
    expect(result).toMatchObject({ ok: false, code: "request_failed" });
    await harness.experimental_dispose();
  });

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
      "ai.voice.transcribe",
      BASE_INPUT,
    );
    expect(result).toEqual({ ok: true, model: "grok-stt", text: "hi there" });
    await harness.experimental_dispose();
  });
});
