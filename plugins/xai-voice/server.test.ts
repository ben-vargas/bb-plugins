import { describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  type ExperimentalFakeHostRpcCall,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import type { XaiVoiceTextResult } from "./src/host-contract.js";

function setup(
  answer: (call: ExperimentalFakeHostRpcCall) => unknown,
  primaryHostId: string | null = "host-1",
) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "xai-voice",
    sdk: { system: { config: async () => ({ primaryHostId }) } },
    experimental_callHostRpc: answer,
  });
  plugin(bb);
  const [service] = harness.registrations.aiServiceRegistrations;
  if (service?.transcribe === undefined || service.status === undefined) {
    throw new Error("xAI Voice did not register a transcribe service");
  }
  return {
    service,
    transcribe: service.transcribe,
    status: service.status,
    calls: harness.inspection.experimental_hostRpcCalls,
  };
}

const audio = () =>
  new File([new Uint8Array([1, 2, 3])], "clip.webm", { type: "audio/webm" });

describe("server factory", () => {
  it("registers a voice-only xai-voice service", () => {
    const { service } = setup(() => ({ ok: true, text: "" }));
    expect(service.id).toBe("xai-voice");
    expect(service.complete).toBeUndefined();
  });

  it("forwards the recording to the primary host and returns its text", async () => {
    const xai = setup(
      (): XaiVoiceTextResult => ({ ok: true, text: "hello world" }),
    );
    const signal = new AbortController().signal;
    await expect(xai.transcribe(audio(), { signal, hint: null })).resolves.toBe(
      "hello world",
    );
    expect(xai.calls).toHaveLength(1);
    expect(xai.calls[0]).toMatchObject({
      method: "xai.voice.transcribe",
      hostId: "host-1",
      signal,
      input: {
        audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
        mimeType: "audio/webm",
        filename: "clip.webm",
        timeoutMs: 10_000,
      },
    });
  });

  it("rejects with the host's failure message", async () => {
    const xai = setup(
      (): XaiVoiceTextResult => ({
        ok: false,
        code: "auth_required",
        message: "Run grok to sign in",
      }),
    );
    await expect(
      xai.transcribe(audio(), {
        signal: new AbortController().signal,
        hint: null,
      }),
    ).rejects.toThrow("Run grok to sign in");
  });

  it("reports not ready without a primary machine", async () => {
    const xai = setup(() => ({ ready: true }), null);
    await expect(xai.status()).resolves.toEqual({
      ready: false,
      message: "No primary machine is connected",
    });
    expect(xai.calls).toHaveLength(0);
  });

  it("asks the primary host for status", async () => {
    const xai = setup(() => ({ ready: true }));
    await expect(xai.status()).resolves.toEqual({ ready: true });
    expect(xai.calls[0]).toMatchObject({ method: "xai.voice.status" });
  });
});
