import { Buffer } from "node:buffer";
import type { BbPluginApi, PluginAiServiceStatus } from "@get-bb/plugin-sdk";
import {
  xaiVoiceHostContract,
  type XaiVoiceTextResult,
} from "./src/host-contract.js";
import { XAI_VOICE_SERVICE_ID } from "./src/xai-stt.js";

/** bb aborts a voice transcription after 10 seconds. */
const TRANSCRIBE_TIMEOUT_MS = 10_000;
const HOST_CALL_GRACE_MS = 1_000;
const STATUS_TIMEOUT_MS = 2_000;

/**
 * Registers the `xai-voice` AI service for bb's voice input. Select it in
 * Settings → AI services, or with
 * `bb settings ai-services set voice xai-voice`. Transcription runs in this
 * plugin's host entry on the primary machine, which reads the host-local
 * credentials (`XAI_API_KEY` or the Grok CLI's OAuth session) and calls
 * xAI's speech-to-text.
 */
export default function plugin(bb: BbPluginApi) {
  if (typeof bb.experimental_aiServices?.register !== "function") {
    throw new Error(
      "This bb version has no AI-services plugin API; xAI Voice needs bb 0.44 or newer.",
    );
  }
  const host = bb.hosts.experimental_client({ contract: xaiVoiceHostContract });

  async function primaryHostId(): Promise<string | null> {
    return (await bb.sdk.system.config()).primaryHostId;
  }

  bb.experimental_aiServices.register({
    id: XAI_VOICE_SERVICE_ID,
    displayName: "xAI (API key or Grok sign-in)",
    async transcribe(audio, { signal }) {
      const hostId = await primaryHostId();
      if (hostId === null) throw new Error("No primary machine is connected");
      const result: XaiVoiceTextResult = await host.call(
        "xai.voice.transcribe",
        {
          audioBase64: Buffer.from(await audio.arrayBuffer()).toString(
            "base64",
          ),
          mimeType: audio.type || "application/octet-stream",
          filename: audio.name || "voice-input",
          timeoutMs: TRANSCRIBE_TIMEOUT_MS,
        },
        {
          hostId,
          signal,
          timeoutMs: TRANSCRIBE_TIMEOUT_MS + HOST_CALL_GRACE_MS,
        },
      );
      if (result.ok) return result.text;
      throw new Error(result.message);
    },
    async status(): Promise<PluginAiServiceStatus> {
      const hostId = await primaryHostId();
      if (hostId === null) {
        return { ready: false, message: "No primary machine is connected" };
      }
      return host.call(
        "xai.voice.status",
        {},
        { hostId, timeoutMs: STATUS_TIMEOUT_MS },
      );
    },
  });
  bb.log.info(
    "xAI voice transcription registered — select it with `bb settings ai-services set voice xai-voice`.",
  );
}
