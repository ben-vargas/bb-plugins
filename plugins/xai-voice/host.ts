/**
 * Host entry: serves bb's AI-services voice contract on the primary host.
 * Credentials are host-local (XAI_API_KEY env or the Grok CLI's OAuth
 * store), which is why transcription runs here rather than in the server
 * process. The Grok store is strictly read-only for this plugin — an expired
 * session is refreshed by delegating to the `grok` CLI (see src/xai-stt.ts).
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import {
  experimental_aiServicesHostContract,
  type ExperimentalAiInferenceCompleteOutput,
  type ExperimentalAiVoiceTranscribeOutput,
} from "@get-bb/plugin-sdk/ai-services";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import {
  resolveGrokAuthPath,
  transcribeXaiVoice,
  XAI_VOICE_SERVICE_ID,
  type XaiSttDeps,
} from "./src/xai-stt.js";

function runGrokRefresh(): Promise<{ ran: boolean; detail?: string }> {
  return new Promise((resolve) => {
    // `grok sessions list` begins with `try_ensure_fresh_auth` — the CLI's
    // unconditional, non-interactive refresh chain (flock, rotation, atomic
    // persist) with no internal cancellation. NEVER pass a timeout here:
    // killing the child mid-token-exchange can abandon an IdP response that
    // carried the rotated refresh token and invalidate the CLI session.
    // Callers race this promise against their own budget instead; a
    // detached, unref'd child finishes (and persists) on its own even if
    // this worker is torn down first.
    const child = spawn("grok", ["sessions", "list", "-n", "1"], {
      env: {
        ...process.env,
        // Pin the child to the exact store this plugin reads, so the two
        // sides can never diverge on GROK_HOME/GROK_AUTH_PATH semantics.
        GROK_AUTH_PATH: resolveGrokAuthPath(process.env, os.homedir()),
      },
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    child.on("error", (error) => {
      resolve({ ran: false, detail: error.message });
    });
    child.on("exit", (code) => {
      resolve(
        code === 0 ? { ran: true } : { ran: true, detail: `grok exited ${code}` },
      );
    });
  });
}

/**
 * One shared deps instance: the refresh single-flight gate in xai-stt.ts is
 * keyed by it, so concurrent transcriptions share one grok CLI spawn.
 */
const deps: XaiSttDeps = {
  fetchImpl: (...args) => fetch(...args),
  readTextFile: (filePath) => readFile(filePath, "utf8"),
  runGrokRefresh,
  env: process.env,
  homeDir: os.homedir(),
  now: () => Date.now(),
};

export default experimental_defineHostEntry({
  contract: experimental_aiServicesHostContract,
  handlers: {
    "ai.inference.complete": async (
      input,
    ): Promise<ExperimentalAiInferenceCompleteOutput> => ({
      ok: false,
      code: "request_failed",
      message: `The "${input.serviceId}" service serves voice transcription only.`,
    }),
    "ai.voice.transcribe": async (
      input,
    ): Promise<ExperimentalAiVoiceTranscribeOutput> => {
      if (input.serviceId !== XAI_VOICE_SERVICE_ID) {
        return {
          ok: false,
          code: "request_failed",
          message: `This plugin serves no AI service "${input.serviceId}".`,
        };
      }
      try {
        return await transcribeXaiVoice(input, deps);
      } catch (error) {
        return {
          ok: false,
          code: "request_failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
});
