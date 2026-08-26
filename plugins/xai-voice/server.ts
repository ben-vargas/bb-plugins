import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { XAI_VOICE_SERVICE_ID } from "./src/xai-stt.js";

/**
 * Registers the `xai` voice AI service. bb routes
 * `BB_TRANSCRIPTION=xai-voice/<model>` to this plugin's host entry, which calls
 * xAI's speech-to-text with host-local credentials (`XAI_API_KEY` or the
 * Grok CLI's OAuth session). xAI exposes no STT model choice, so the
 * `<model>` segment is echoed back but otherwise unused — `xai-voice/grok-stt`
 * is a fine value. (The id is not "xai": that is reserved for the server's
 * own direct integration.)
 */
export default function plugin(bb: BbPluginApi) {
  if (typeof bb.experimental_aiServices?.register !== "function") {
    throw new Error(
      "This bb version has no AI-services plugin API; xAI Voice needs a bb newer than 0.39.0.",
    );
  }
  bb.experimental_aiServices.register({
    id: XAI_VOICE_SERVICE_ID,
    displayName: "xAI (API key or Grok sign-in)",
    kinds: ["voice"],
  });
  bb.log.info(
    "xAI voice transcription registered — select it with `npx bb-app config set BB_TRANSCRIPTION xai-voice/grok-stt`.",
  );
}
