/**
 * RPC contract between this plugin's server entry (which registers the AI
 * service with bb) and its host entry (which holds the host-local xAI
 * credentials and calls xAI). bb only sees the server-side `transcribe`
 * function; this contract is private to the plugin.
 */
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const xaiVoiceFailureCodeSchema = z.enum([
  "timeout",
  "rate_limited",
  "service_unavailable",
  "auth_required",
  "request_failed",
  "invalid_response",
]);
export type XaiVoiceFailureCode = z.infer<typeof xaiVoiceFailureCodeSchema>;

const failureSchema = z
  .object({
    ok: z.literal(false),
    code: xaiVoiceFailureCodeSchema,
    message: z.string().min(1),
  })
  .strict();
export type XaiVoiceFailure = z.infer<typeof failureSchema>;

const textResultSchema = z.union([
  z.object({ ok: z.literal(true), text: z.string() }).strict(),
  failureSchema,
]);
export type XaiVoiceTextResult = z.infer<typeof textResultSchema>;

export const xaiVoiceTranscribeInputSchema = z
  .object({
    audioBase64: z.string().min(1),
    mimeType: z.string().min(1),
    filename: z.string().min(1),
    timeoutMs: z.number().int().positive(),
  })
  .strict();
export type XaiVoiceTranscribeInput = z.infer<
  typeof xaiVoiceTranscribeInputSchema
>;

export const xaiVoiceStatusSchema = z.discriminatedUnion("ready", [
  z.object({ ready: z.literal(true) }).strict(),
  z.object({ ready: z.literal(false), message: z.string().min(1) }).strict(),
]);
export type XaiVoiceStatus = z.infer<typeof xaiVoiceStatusSchema>;

export const xaiVoiceHostContract = defineRpcContract({
  "xai.voice.transcribe": {
    input: xaiVoiceTranscribeInputSchema,
    output: textResultSchema,
  },
  "xai.voice.status": {
    input: z.object({}).strict(),
    output: xaiVoiceStatusSchema,
  },
});
